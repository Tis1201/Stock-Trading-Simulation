# app/services/backtest_engine.py

import os
from datetime import datetime, date, timedelta
from typing import List, Dict, Any, Optional

import pandas as pd
import numpy as np
from sqlalchemy import create_engine

from app.models.backtest_models import (
    BacktestJobMessage,
    BacktestResultMessage,
    BacktestTrade,
    EquityPoint,
)

# ============================================================
# 1) CONFIG & DATABASE CONNECTION
# ============================================================

_RAW_DB_URL = os.getenv("PY_DATABASE_URL") or os.getenv("DATABASE_URL")

# Chuyển đổi chuỗi kết nối để tương thích với SQLAlchemy
if _RAW_DB_URL and _RAW_DB_URL.startswith("postgres://"):
    DB_URL = _RAW_DB_URL.replace("postgres://", "postgresql://", 1)
else:
    DB_URL = _RAW_DB_URL

# Tạo Engine toàn cục (Global Engine)
if DB_URL:
    db_engine = create_engine(DB_URL, pool_size=10, max_overflow=20)
else:
    db_engine = None

# Số ngày load thêm về quá khứ (Warm-up period) để tính chỉ báo
LOOKBACK_BUFFER_DAYS = 90


# ============================================================
# 2) STRATEGY / INDICATOR UTILITIES
# ============================================================

def _get_strategy_dict(job: BacktestJobMessage) -> Optional[Dict[str, Any]]:
    """
    Trích xuất strategy từ job dưới dạng dict (nếu có).
    Hỗ trợ cả trường hợp strategy là dict, hoặc Pydantic model.
    """
    strategy = getattr(job, "strategy", None)
    if strategy is None:
        return None

    if isinstance(strategy, dict):
        return strategy

    # Pydantic v1
    if hasattr(strategy, "dict"):
        try:
            return strategy.dict()
        except Exception:
            pass

    # Pydantic v2
    if hasattr(strategy, "model_dump"):
        try:
            return strategy.model_dump()
        except Exception:
            pass

    return None


def _extract_required_indicators(strategy: Optional[Dict[str, Any]]) -> Dict[str, set]:
    """
    Đọc strategy.rules (nếu có) và gom lại các indicator + period cần tính.
    Ví dụ:
      - SMA period 10, 50
      - RSI period 14
    """
    required: Dict[str, set] = {}
    if not strategy:
        return required

    rules = strategy.get("rules") or []
    for rule in rules:
        cond = rule.get("condition") or {}
        cmp_ = cond.get("compare_to") or {}

        for side in (cond, cmp_):
            indicator = side.get("indicator")
            if not indicator:
                continue
            indicator = str(indicator).upper()
            params = side.get("params") or {}
            period = params.get("period")
            if period is not None:
                try:
                    p_int = int(period)
                except Exception:
                    continue
                required.setdefault(indicator, set()).add(p_int)
            else:
                required.setdefault(indicator, set())

    return required


def _compute_rsi_series(close: pd.Series, period: int) -> pd.Series:
    """
    Tính RSI cho một chu kỳ bất kỳ.
    """
    delta = close.diff()
    gain = delta.where(delta > 0, 0.0)
    loss = -delta.where(delta < 0, 0.0)

    avg_gain = gain.rolling(window=period, min_periods=period).mean()
    avg_loss = loss.rolling(window=period, min_periods=period).mean()

    rs = avg_gain / avg_loss
    rsi = 100.0 - (100.0 / (1.0 + rs))
    return rsi


# ============================================================
# 3) PANDAS INDICATOR CALCULATION
# ============================================================

def calculate_indicators(df: pd.DataFrame) -> pd.DataFrame:
    """
    Tính toán các chỉ báo kỹ thuật mặc định bằng Pandas.
    Hiện tại: SMA10, SMA50, RSI14 (có thể mở rộng thêm sau).
    """
    # Đảm bảo các cột giá là float
    for col in ["close", "open", "high", "low"]:
        if col in df.columns:
            df[col] = df[col].astype(float)

    # 1. SMA (Simple Moving Average) mặc định
    df["sma_fast"] = df["close"].rolling(window=10, min_periods=10).mean()
    df["sma_slow"] = df["close"].rolling(window=50, min_periods=50).mean()

    # 2. RSI mặc định (14)
    df["rsi"] = _compute_rsi_series(df["close"], 14)

    # Chỉ giữ lại những hàng đã có đủ chỉ báo mặc định
    df = df.dropna().reset_index(drop=True)
    return df


def _compute_extra_indicators_for_strategy(
    df: pd.DataFrame,
    required: Dict[str, set],
) -> pd.DataFrame:
    """
    Dựa trên danh sách indicator/period cần từ strategy,
    tính thêm các cột SMA_xx, RSI_xx... mà không đụng tới các cột mặc định.
    """
    if not required:
        return df

    # SMA
    for period in required.get("SMA", set()):
        col_name = f"sma_{period}"
        if col_name not in df.columns:
            df[col_name] = df["close"].rolling(window=period, min_periods=period).mean()

    # RSI
    for period in required.get("RSI", set()):
        col_name = f"rsi_{period}"
        if col_name not in df.columns:
            df[col_name] = _compute_rsi_series(df["close"], period)

    # Các indicator khác (EMA, MACD, BOLLINGER...) có thể bổ sung sau.
    # Hiện tại nếu user dùng, rule đó đơn giản là không kích hoạt
    # vì chúng ta không có giá trị -> điều kiện luôn False.

    return df


# ============================================================
# 4) DATA LOADING (With Warm-up & Type Casting)
# ============================================================

def load_data_as_dataframe(job: BacktestJobMessage) -> pd.DataFrame:
    print(f"[FastAPI] Loading data for {job.symbol}...")

    if not db_engine:
        raise RuntimeError("DB Engine not initialized. Check DATABASE_URL in .env")

    # Xử lý ngày tháng input
    if isinstance(job.data_from, date):
        dt_from_req = datetime.combine(job.data_from, datetime.min.time())
    else:
        dt_from_req = job.data_from

    if isinstance(job.data_to, date):
        dt_to_req = datetime.combine(job.data_to, datetime.max.time())
    else:
        dt_to_req = job.data_to

    # Warm-up: lấy thêm dữ liệu trước đó để tính chỉ báo
    dt_fetch_from = dt_from_req - timedelta(days=LOOKBACK_BUFFER_DAYS)

    query = """
        SELECT
            EXTRACT(EPOCH FROM trade_date)::bigint AS ts,
            trade_date,
            open_price::float  AS open,
            high_price::float  AS high,
            low_price::float   AS low,
            close_price::float AS close
        FROM "StockPrice"
        WHERE stock_symbol = %(symbol)s
          AND trade_date >= %(start)s
          AND trade_date <= %(end)s
        ORDER BY trade_date ASC
    """

    try:
        df = pd.read_sql(
            query,
            db_engine,
            params={
                "symbol": job.symbol,
                "start": dt_fetch_from,
                "end": dt_to_req,
            },
        )

        if df.empty:
            print(f"[FastAPI] ⚠ No price data for symbol={job.symbol}")
            return df

        # Tính toán chỉ báo mặc định
        df = calculate_indicators(df)

        # Tính thêm indicator tùy theo strategy (nếu có)
        strategy = _get_strategy_dict(job)
        required = _extract_required_indicators(strategy)
        if required:
            df = _compute_extra_indicators_for_strategy(df, required)

        # Chuẩn hóa trade_date
        df["trade_date"] = pd.to_datetime(df["trade_date"])

        # Cắt bỏ phần warm-up: chỉ giữ lại data từ ngày user yêu cầu trở đi
        df_final = df[df["trade_date"] >= pd.to_datetime(dt_from_req)].copy()
        df_final.reset_index(drop=True, inplace=True)

        print(
            f"[FastAPI] ✅ Loaded {len(df)} rows total. "
            f"After warm-up trimming: {len(df_final)} rows."
        )
        return df_final

    except Exception as e:
        print(f"[FastAPI] ❌ Error loading data: {e}")
        return pd.DataFrame()


# ============================================================
# 5) USER RULE EVALUATION HELPERS
# ============================================================

def _get_indicator_value_from_row(
    row: Any,
    df: pd.DataFrame,
    idx: int,
    indicator: Optional[str],
    params: Optional[Dict[str, Any]],
) -> Optional[float]:
    """
    Đọc giá trị indicator/price từ 1 row theo chuẩn JSON strategy:
      indicator: "SMA", "RSI", "OPEN", "CLOSE", "HIGH", "LOW"
      params: { "period": 10 } (cho SMA/RSI).
    """
    if not indicator:
        return None

    indicator = str(indicator).upper()
    period = None
    if params:
        period = params.get("period")
        if period is not None:
            try:
                period = int(period)
            except Exception:
                period = None

    # Giá cơ bản
    if indicator == "OPEN":
        return float(row.open)
    if indicator == "CLOSE":
        return float(row.close)
    if indicator == "HIGH":
        return float(row.high)
    if indicator == "LOW":
        return float(row.low)

    # SMA
    if indicator == "SMA":
        if period is None:
            return None
        col_name = f"sma_{period}"
        return getattr(row, col_name, None)

    # RSI
    if indicator == "RSI":
        if period is not None:
            col_name = f"rsi_{period}"
            return getattr(row, col_name, None)
        # fallback: dùng rsi mặc định 14
        return getattr(row, "rsi", None)

    # Chưa hỗ trợ: EMA, MACD, BOLLINGER -> None (rule sẽ không kích hoạt)
    return None


def _evaluate_single_rule(
    rule: Dict[str, Any],
    df: pd.DataFrame,
    row: Any,
    idx: int,
) -> bool:
    """
    Đánh giá 1 rule tại 1 bar:
      condition: { indicator, params, operator, compare_to }
    Hỗ trợ operator: "<", ">", "cross_over", "cross_under"
    """
    cond = rule.get("condition") or {}
    operator = cond.get("operator")
    cmp_ = cond.get("compare_to") or {}

    if not operator:
        return False

    left_val = _get_indicator_value_from_row(
        row,
        df,
        idx,
        cond.get("indicator"),
        cond.get("params") or {},
    )

    # value so sánh có thể là indicator khác hoặc value cố định
    right_val = None
    if "indicator" in cmp_:
        right_val = _get_indicator_value_from_row(
            row,
            df,
            idx,
            cmp_.get("indicator"),
            cmp_.get("params") or {},
        )
    elif "value" in cmp_:
        try:
            right_val = float(cmp_["value"])
        except Exception:
            right_val = None

    # Thiếu dữ liệu -> rule không kích hoạt
    if left_val is None or right_val is None:
        return False

    # Operator thường
    if operator == "<":
        return left_val < right_val
    if operator == ">":
        return left_val > right_val

    # cross_over / cross_under cần giá trị bar trước
    if operator in ("cross_over", "cross_under"):
        if idx == 0:
            return False  # bar đầu tiên không có previous

        prev_row = df.iloc[idx - 1]

        prev_left = _get_indicator_value_from_row(
            prev_row,
            df,
            idx - 1,
            cond.get("indicator"),
            cond.get("params") or {},
        )
        if "indicator" in cmp_:
            prev_right = _get_indicator_value_from_row(
                prev_row,
                df,
                idx - 1,
                cmp_.get("indicator"),
                cmp_.get("params") or {},
            )
        elif "value" in cmp_:
            try:
                prev_right = float(cmp_["value"])
            except Exception:
                prev_right = None
        else:
            prev_right = None

        if prev_left is None or prev_right is None:
            return False

        if operator == "cross_over":
            # trước: dưới hoặc bằng, hiện tại: trên
            return prev_left <= prev_right and left_val > right_val
        else:  # cross_under
            # trước: trên hoặc bằng, hiện tại: dưới
            return prev_left >= prev_right and left_val < right_val

    return False


def _decide_action_from_user_rules(
    rules: List[Dict[str, Any]],
    df: pd.DataFrame,
    row: Any,
    idx: int,
    have_position: bool,
) -> Optional[str]:
    """
    Quyết định action "BUY"/"SELL" từ danh sách user rules.
    - Nếu chưa có position -> chỉ xét các rule action BUY.
    - Nếu đang có position -> chỉ xét các rule action SELL / CLOSE / CLOSE_POSITION.
    Rule được ưu tiên theo ruleOrder tăng dần.
    """
    # Sort theo ruleOrder cho ổn định
    sorted_rules = sorted(rules, key=lambda r: r.get("ruleOrder", 0))

    if not have_position:
        # Tìm BUY rule
        for r in sorted_rules:
            action = str(r.get("action", "")).upper()
            if action not in ("BUY", "LONG"):
                continue
            if _evaluate_single_rule(r, df, row, idx):
                return "BUY"
    else:
        # Đang có position -> tìm SELL / CLOSE rule
        for r in sorted_rules:
            action = str(r.get("action", "")).upper()
            if action not in ("SELL", "SHORT", "CLOSE", "CLOSE_POSITION"):
                continue
            if _evaluate_single_rule(r, df, row, idx):
                return "SELL"

    return None


# ============================================================
# 6) CORE BACKTEST LOGIC (LONG-ONLY, THỰC TẾ)
# ============================================================

def run_backtest(job: BacktestJobMessage) -> BacktestResultMessage:
    """
    Hàm thực thi backtest chính.

    - Nếu KHÔNG có strategy.rules:
        + Sử dụng chiến lược MẶC ĐỊNH:
          * Long-only (không short selling).
          * All-in (mua hết vốn khả dụng).
          * Mua khi: SMA10 > SMA50 và RSI > 50.
          * Bán khi: chạm stop-loss, take-profit hoặc SMA10 < SMA50.

    - Nếu CÓ strategy.rules:
        + Bỏ hoàn toàn logic signal mặc định.
        + BUY / SELL được quyết định 100% theo rule của người dùng
          (vẫn giữ stop-loss / take-profit là lớp risk management bổ sung).

    Đồng thời:
    - Không bao giờ cho lỗ vượt quá 100% initialCapital (equity không thể âm).
    - Mỗi lệnh BUY đều sizing theo số tiền hiện có (cash).
    """
    df = load_data_as_dataframe(job)

    if df.empty:
        print(f"[FastAPI] ⚠ No data found for job {job.job_id}. Returning empty result.")
        return _create_empty_result(job)

    # --- BƯỚC 1: ĐỌC STRATEGY VÀ RULES (NẾU CÓ) ---
    strategy_dict = _get_strategy_dict(job)
    user_rules: List[Dict[str, Any]] = []
    if strategy_dict:
        user_rules = strategy_dict.get("rules") or []
    has_user_rules = len(user_rules) > 0

    if has_user_rules:
        print(
            f"[FastAPI] ▶ Using USER STRATEGY for job {job.job_id} "
            f"with {len(user_rules)} rule(s)."
        )
    else:
        print(
            f"[FastAPI] ▶ Using DEFAULT SMA/RSI STRATEGY for job {job.job_id} "
            f"(no user rules provided)."
        )

    # --- BƯỚC 2: CẤU HÌNH ---
    cfg = job.job_config or {}
    stop_loss_pct = float(cfg.get("stop_loss", 0.05))      # 5%
    take_profit_pct = float(cfg.get("take_profit", 0.10))  # 10%
    commission_rate = float(job.commission_rate or 0.0015)  # 0.15%

    # --- BƯỚC 3: BIẾN TRẠNG THÁI ---
    # SAFETY: đảm bảo vốn ban đầu không âm
    initial_capital = max(0.0, float(job.initial_capital or 0.0))
    cash = initial_capital          # tiền mặt
    position_qty = 0.0              # số lượng cổ phiếu đang giữ
    entry_price = 0.0               # giá vốn
    peak_equity = initial_capital   # dùng để tính drawdown

    trades: List[BacktestTrade] = []
    equity_curve: List[EquityPoint] = []
    underwater: List[EquityPoint] = []

    win_trades = 0

    # --- BƯỚC 4: VÒNG LẶP GIAO DỊCH ---
    for idx, row in enumerate(df.itertuples()):
        current_price = float(row.close)
        ts = int(row.ts)

        # --- CHỈ SỐ MẶC ĐỊNH (CHỈ DÙNG CHO CHIẾN LƯỢC MẶC ĐỊNH) ---
        sma_fast = float(row.sma_fast) if hasattr(row, "sma_fast") else np.nan
        sma_slow = float(row.sma_slow) if hasattr(row, "sma_slow") else np.nan
        rsi_val = float(row.rsi) if hasattr(row, "rsi") else np.nan

        # Chỉ số phải hợp lệ nếu dùng default strategy
        if not has_user_rules:
            if np.isnan(sma_fast) or np.isnan(sma_slow) or np.isnan(rsi_val):
                # Cập nhật equity curve rồi continue
                current_equity_value = cash + position_qty * current_price
                equity_curve.append(EquityPoint(time=ts, value=float(current_equity_value)))
                peak_equity = max(peak_equity, current_equity_value)
                dd = (current_equity_value / peak_equity - 1.0) if peak_equity > 0 else 0.0
                underwater.append(EquityPoint(time=ts, value=float(dd)))
                continue

        action: Optional[str] = None

        # --- LOGIC TỪ USER RULES (NẾU CÓ) ---
        if has_user_rules:
            have_pos = position_qty > 0
            action = _decide_action_from_user_rules(
                user_rules,
                df,
                row,
                idx,
                have_pos,
            )

            # Nếu đang có position thì vẫn ưu tiên SL/TP trước SELL từ rule
            if position_qty > 0:
                position_value = position_qty * current_price
                entry_value = position_qty * entry_price
                pnl_pct = (
                    (position_value - entry_value) / entry_value
                    if entry_value > 0
                    else 0.0
                )

                if pnl_pct <= -stop_loss_pct:
                    action = "SELL"  # cắt lỗ
                elif pnl_pct >= take_profit_pct:
                    action = "SELL"  # chốt lời

        # --- LOGIC CHIẾN LƯỢC MẶC ĐỊNH (NẾU KHÔNG CÓ USER RULES) ---
        else:
            if position_qty == 0:
                # Không có vị thế -> tìm điểm MUA
                if sma_slow > 0 and sma_fast > sma_slow and rsi_val > 50:
                    action = "BUY"
            else:
                # Đang có vị thế -> tìm điểm BÁN
                position_value = position_qty * current_price
                entry_value = position_qty * entry_price
                pnl_pct = (
                    (position_value - entry_value) / entry_value
                    if entry_value > 0
                    else 0.0
                )

                # Ưu tiên SL / TP
                if pnl_pct <= -stop_loss_pct:
                    action = "SELL"  # cắt lỗ
                elif pnl_pct >= take_profit_pct:
                    action = "SELL"  # chốt lời
                # Nếu không SL/TP mà trend đảo -> SELL
                elif sma_fast < sma_slow:
                    action = "SELL"

        # --- THỰC THI LỆNH ---
        if action == "BUY" and position_qty == 0 and cash > 0:
            # All-in: dùng toàn bộ cash để mua, có tính phí
            # Cash = Gross + Fee = Qty * Price + Qty * Price * commission
            # => Qty = Cash / (Price * (1 + commission))
            qty = cash / (current_price * (1.0 + commission_rate))

            # SAFETY: nếu vì rounding mà qty quá nhỏ hoặc âm -> bỏ qua
            if qty <= 0:
                qty = 0.0

            if qty > 0:
                gross_cost = qty * current_price
                fee = gross_cost * commission_rate
                total_cost = gross_cost + fee

                # SAFETY: không cho vượt quá cash
                if total_cost > cash:
                    # scale lại qty cho khớp tiền mặt
                    qty = cash / (current_price * (1.0 + commission_rate))
                    gross_cost = qty * current_price
                    fee = gross_cost * commission_rate
                    total_cost = gross_cost + fee

                cash -= total_cost

                # SAFETY: không cho cash âm do sai số float
                if cash < 0:
                    cash = 0.0

                position_qty = qty
                entry_price = current_price

        elif action == "SELL" and position_qty > 0:
            gross_rev = position_qty * current_price
            fee = gross_rev * commission_rate
            net_rev = gross_rev - fee

            # PnL thực tế của trade này
            trade_pnl = net_rev - (position_qty * entry_price)

            cash += net_rev  # chuyển toàn bộ về tiền mặt

            if trade_pnl > 0:
                win_trades += 1

            trades.append(
                BacktestTrade(
                    # Giữ nguyên: entryTime/exitTime cùng ts (không đổi schema)
                    entryTime=ts,
                    exitTime=ts,
                    entryPrice=float(entry_price),
                    exitPrice=float(current_price),
                    quantity=float(position_qty),
                    profit=float(trade_pnl),
                    side="buy",  # close long
                )
            )

            position_qty = 0.0
            entry_price = 0.0

        # --- CẬP NHẬT EQUITY CURVE & DRAWDOWN ---
        current_equity_value = cash + position_qty * current_price

        # SAFETY: equity không thể âm
        if current_equity_value < 0:
            current_equity_value = 0.0

        equity_curve.append(EquityPoint(time=ts, value=float(current_equity_value)))

        peak_equity = max(peak_equity, current_equity_value)
        if peak_equity > 0:
            dd = (current_equity_value / peak_equity) - 1.0
        else:
            dd = 0.0
        underwater.append(EquityPoint(time=ts, value=float(dd)))

    # --- BƯỚC 5: ĐÓNG VỊ THẾ CUỐI CÙNG NẾU CÒN ---
    if position_qty > 0:
        last_row = df.iloc[-1]
        last_price = float(last_row.close)
        last_ts = int(last_row.ts)

        gross = position_qty * last_price
        fee = gross * commission_rate
        net = gross - fee
        pnl = net - (position_qty * entry_price)

        cash += net
        if pnl > 0:
            win_trades += 1

        trades.append(
            BacktestTrade(
                entryTime=last_ts,
                exitTime=last_ts,
                entryPrice=float(entry_price),
                exitPrice=float(last_price),
                quantity=float(position_qty),
                profit=float(pnl),
                side="buy",
            )
        )

        # Cập nhật equity cuối cùng
        final_equity_value = cash
        if final_equity_value < 0:
            final_equity_value = 0.0

        equity_curve.append(EquityPoint(time=last_ts, value=float(final_equity_value)))
        peak_equity = max(peak_equity, final_equity_value)
        dd = (final_equity_value / peak_equity - 1.0) if peak_equity > 0 else 0.0
        underwater.append(EquityPoint(time=last_ts, value=float(dd)))

    # --- BƯỚC 6: TÍNH TOÁN KẾT QUẢ ---
    # SAFETY: equity cuối cùng không âm
    final_equity = max(0.0, cash)

    total_trades = len(trades)
    net_profit_raw = final_equity - initial_capital

    # SAFETY: lỗ tối đa không vượt quá 100% vốn ban đầu
    min_allowed_profit = -initial_capital
    if net_profit_raw < min_allowed_profit:
        print(
            f"[FastAPI] ⚠ netProfit ({net_profit_raw:,.2f}) < -initial_capital "
            f"({-initial_capital:,.2f}), clamping to {-initial_capital:,.2f}"
        )
        net_profit = min_allowed_profit
    else:
        net_profit = net_profit_raw

    if total_trades > 0:
        win_rate = (win_trades / total_trades) * 100.0
    else:
        win_rate = 0.0

    max_dd = 0.0
    if underwater:
        min_dd = min(p.value for p in underwater)
        max_dd = abs(min_dd) * 100.0  # chuyển về % dương

    gross_win = sum(t.profit for t in trades if t.profit > 0)
    gross_loss = abs(sum(t.profit for t in trades if t.profit < 0))
    if gross_loss > 0:
        profit_factor = gross_win / gross_loss
    else:
        profit_factor = gross_win if gross_win > 0 else 0.0

    print(
        f"[FastAPI] 🏁 Job {job.job_id} Done. "
        f"Trades: {total_trades}, NetProfit: {net_profit:,.2f}, "
        f"WinRate: {win_rate:.2f}%, MaxDD: {max_dd:.2f}%, PF: {profit_factor:.2f}"
    )

    return BacktestResultMessage(
        job_id=job.job_id,
        status="COMPLETED",
        netProfit=float(net_profit),
        winRate=float(win_rate),
        maxDrawdown=float(max_dd),
        profitFactor=float(profit_factor),
        totalTrades=total_trades,
        equityCurve=equity_curve,
        underwater=underwater,
        trades=trades,
    )


# ============================================================
# 7) EMPTY RESULT HELPER
# ============================================================

def _create_empty_result(job: BacktestJobMessage) -> BacktestResultMessage:
    """Trả về kết quả rỗng khi không có dữ liệu."""
    return BacktestResultMessage(
        job_id=job.job_id,
        status="COMPLETED",
        netProfit=0.0,
        winRate=0.0,
        maxDrawdown=0.0,
        profitFactor=0.0,
        totalTrades=0,
        equityCurve=[],
        underwater=[],
        trades=[],
    )
