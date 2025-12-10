# app/services/backtest_engine.py

import os
from datetime import datetime, date, timedelta
from typing import List, Dict, Optional

import pandas as pd
import numpy as np
# Dùng SQLAlchemy để tương thích tốt nhất với Pandas
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
    # pool_size=10: Giữ 10 kết nối sẵn sàng
    # max_overflow=20: Cho phép mở thêm 20 kết nối khi quá tải
    db_engine = create_engine(DB_URL, pool_size=10, max_overflow=20)
else:
    db_engine = None

# Số ngày load thêm về quá khứ (Warm-up period) để tính chỉ báo SMA50
LOOKBACK_BUFFER_DAYS = 90


# ============================================================
# 2) PANDAS INDICATOR CALCULATION (Vectorized)
# ============================================================

def calculate_indicators(df: pd.DataFrame) -> pd.DataFrame:
    """
    Tính toán các chỉ báo kỹ thuật bằng Pandas.
    """
    # Đảm bảo các cột giá là float (tránh lỗi Decimal từ DB)
    cols_to_fix = ['close', 'open', 'high', 'low']
    for col in cols_to_fix:
        if col in df.columns:
            df[col] = df[col].astype(float)

    # 1. SMA (Simple Moving Average)
    df['sma_fast'] = df['close'].rolling(window=10).mean()
    df['sma_slow'] = df['close'].rolling(window=50).mean()

    # 2. RSI (Relative Strength Index) - chu kỳ 14
    delta = df['close'].diff()

    # Tách phần tăng và phần giảm
    gain = delta.where(delta > 0, 0)
    loss = -delta.where(delta < 0, 0)

    # Tính trung bình gain/loss (Simple Moving Average cho RSI đơn giản)
    avg_gain = gain.rolling(window=14).mean()
    avg_loss = loss.rolling(window=14).mean()

    # Tính RS và RSI
    rs = avg_gain / avg_loss
    df['rsi'] = 100 - (100 / (1 + rs))

    # Fill các giá trị NaN (do rolling tạo ra ở đầu chuỗi) bằng 0
    df = df.fillna(0)

    return df


# ============================================================
# 3) DATA LOADING (With Warm-up & Type Casting)
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

    # Warm-up: Lùi ngày bắt đầu lại 90 ngày để lấy dữ liệu tính chỉ báo
    dt_fetch_from = dt_from_req - timedelta(days=LOOKBACK_BUFFER_DAYS)

    # Câu query ép kiểu ::float ngay từ Database để tránh lỗi 'No numeric types'
    query = """
            SELECT EXTRACT(EPOCH FROM trade_date)::bigint AS ts, trade_date, \
                   open_price::float as open,
            high_price::float as high,
            low_price::float as low,
            close_price::float as close
            FROM "StockPrice"
            WHERE stock_symbol = %(symbol)s
              AND trade_date >= %(start)s
              AND trade_date <= %(end)s
            ORDER BY trade_date ASC \
            """

    try:
        # Load dữ liệu vào Pandas DataFrame
        df = pd.read_sql(
            query,
            db_engine,
            params={
                "symbol": job.symbol,
                "start": dt_fetch_from,
                "end": dt_to_req
            }
        )

        if df.empty:
            return df

        # Tính toán chỉ báo trên toàn bộ dữ liệu (bao gồm cả phần warm-up)
        df = calculate_indicators(df)

        # Chuyển đổi trade_date sang datetime chuẩn của pandas để so sánh
        df['trade_date'] = pd.to_datetime(df['trade_date'])

        # Cắt bỏ phần warm-up: Chỉ giữ lại dữ liệu từ ngày user yêu cầu trở đi
        # Nhưng lúc này các cột SMA/RSI đã có giá trị đầy đủ.
        df_final = df[df['trade_date'] >= pd.to_datetime(dt_from_req)].copy()

        # Reset index cho sạch đẹp
        df_final.reset_index(drop=True, inplace=True)

        print(f"[FastAPI] ✅ Loaded {len(df)} rows total. After warm-up trimming: {len(df_final)} rows.")
        return df_final

    except Exception as e:
        print(f"[FastAPI] ❌ Error loading data: {e}")
        # Trả về DataFrame rỗng nếu lỗi
        return pd.DataFrame()


# ============================================================
# 4) CORE BACKTEST LOGIC (ĐÃ SỬA LỖI MUA BÁN)
# ============================================================

def run_backtest(job: BacktestJobMessage) -> BacktestResultMessage:
    """
    Hàm thực thi backtest chính.
    """
    # --- BƯỚC 1: LOAD DỮ LIỆU ---
    df = load_data_as_dataframe(job)

    if df.empty:
        print(f"[FastAPI] ⚠ No data found for job {job.job_id}. Returning empty result.")
        return _create_empty_result(job)

    # --- BƯỚC 2: CẤU HÌNH ---
    cfg = job.job_config or {}
    stop_loss_pct = float(cfg.get("stop_loss", 0.05))
    take_profit_pct = float(cfg.get("take_profit", 0.10))
    commission_rate = float(job.commission_rate or 0.0015)

    # --- BƯỚC 3: KHỞI TẠO BIẾN TRẠNG THÁI ---
    initial_equity = float(job.initial_capital)
    equity = initial_equity
    peak_equity = initial_equity

    holdings = 0.0
    entry_price = 0.0

    trades: List[BacktestTrade] = []
    equity_curve: List[EquityPoint] = []
    underwater: List[EquityPoint] = []

    win_trades = 0

    # --- BƯỚC 4: VÒNG LẶP GIAO DỊCH ---
    for row in df.itertuples():
        current_price = row.close
        ts = int(row.ts)

        sma_fast = row.sma_fast
        sma_slow = row.sma_slow
        rsi_val = row.rsi

        action = None

        # --- LOGIC CHIẾN LƯỢC ---
        if holdings == 0:
            # MUA KHI: Fast cắt lên Slow VÀ RSI > 50
            if sma_slow > 0 and sma_fast > sma_slow and rsi_val > 50:
                action = "BUY"
        else:
            # BÁN KHI: Chạm SL/TP HOẶC Fast cắt xuống Slow
            cur_val = holdings * current_price
            entry_val = holdings * entry_price
            pnl_pct = (cur_val - entry_val) / entry_val if entry_val > 0 else 0

            if pnl_pct <= -stop_loss_pct:
                action = "SELL"
            elif pnl_pct >= take_profit_pct:
                action = "SELL"
            elif sma_fast < sma_slow:
                action = "SELL"

        # --- THỰC HIỆN LỆNH (EXECUTION) ---

        if action == "BUY" and holdings == 0:
            # === [FIX QUAN TRỌNG] TÍNH TOÁN SỐ LƯỢNG MUA ===
            # Công thức: Tiền thực mua = Tổng vốn / (1 + %phí)
            # Ví dụ: Có 100đ, phí 10%. Chỉ được mua 90.9đ tiền hàng, phí là 9.09đ. Tổng = 100đ.

            usable_cash = equity / (1 + commission_rate)
            qty = usable_cash / current_price

            # (Optional) Làm tròn xuống số nguyên nếu muốn giống thực tế
            # qty = int(qty)

            if qty > 0:
                gross_cost = qty * current_price
                fee = gross_cost * commission_rate

                # Thực hiện trừ tiền
                equity -= (gross_cost + fee)  # Tiền mặt giảm
                # Nhưng logic ở đây ta theo dõi tổng tài sản (Equity).
                # Khi mua, Equity giảm đi đúng bằng phần PHÍ (Fee).
                # Phần gross_cost chuyển từ Tiền -> Cổ phiếu (Holdings).
                # Để đơn giản hóa biến 'equity' trong vòng lặp này đại diện cho "Cash Balance":

                holdings = qty
                entry_price = current_price

                # Lúc này biến 'equity' coi như bằng 0 (vì all-in), chỉ còn số lẻ rất nhỏ
                equity = equity  # Cập nhật lại số dư tiền mặt còn lại (gần bằng 0)

        elif action == "SELL" and holdings > 0:
            gross_rev = holdings * current_price
            fee = gross_rev * commission_rate
            net_rev = gross_rev - fee

            # Tính lãi lỗ
            trade_pnl = net_rev - (holdings * entry_price)

            # Tiền mặt sau khi bán = Doanh thu ròng + Số dư lẻ (nếu có)
            equity += net_rev

            if trade_pnl > 0:
                win_trades += 1

            trades.append(BacktestTrade(
                entryTime=ts,
                exitTime=ts,
                entryPrice=float(entry_price),
                exitPrice=float(current_price),
                quantity=float(holdings),
                profit=float(trade_pnl),
                side="buy"  # Trong Spot market, đóng lệnh mua vẫn là side buy (hoặc ghi nhận là trade đã close)
            ))

            holdings = 0.0
            entry_price = 0.0

        # --- CẬP NHẬT EQUITY CURVE ---
        # Equity Curve = Tiền mặt + Giá trị cổ phiếu hiện tại
        current_equity_value = equity
        if holdings > 0:
            current_equity_value += (holdings * current_price)

        equity_curve.append(EquityPoint(time=ts, value=float(current_equity_value)))

        peak_equity = max(peak_equity, current_equity_value)
        dd = (current_equity_value / peak_equity) - 1.0 if peak_equity > 0 else 0.0
        underwater.append(EquityPoint(time=ts, value=float(dd)))

    # --- BƯỚC 5: ĐÓNG VỊ THẾ CUỐI CÙNG ---
    if holdings > 0:
        last_row = df.iloc[-1]
        last_price = last_row.close
        last_ts = int(last_row.ts)

        gross = holdings * last_price
        fee = gross * commission_rate
        net = gross - fee
        pnl = net - (holdings * entry_price)

        equity += net
        if pnl > 0: win_trades += 1

        trades.append(BacktestTrade(
            entryTime=last_ts, exitTime=last_ts,
            entryPrice=float(entry_price), exitPrice=float(last_price),
            quantity=float(holdings), profit=float(pnl), side="buy"
        ))

    # --- BƯỚC 6: TÍNH KẾT QUẢ ---
    total_trades = len(trades)
    net_profit = equity - initial_equity
    win_rate = (win_trades / total_trades * 100) if total_trades > 0 else 0.0

    max_dd = 0.0
    if underwater:
        max_dd = abs(min([p.value for p in underwater])) * 100

    gross_win = sum(t.profit for t in trades if t.profit > 0)
    gross_loss = abs(sum(t.profit for t in trades if t.profit < 0))
    profit_factor = (gross_win / gross_loss) if gross_loss > 0 else 0.0

    print(f"[FastAPI] 🏁 Job {job.job_id} Done. Trades: {total_trades}, NetProfit: {net_profit:,.2f}")

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
        trades=trades
    )

def _create_empty_result(job):
    """Trả về kết quả rỗng khi không có dữ liệu"""
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
        trades=[]
    )