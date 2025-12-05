# app/api/market_simulation.py

from __future__ import annotations
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Literal, Dict, List, Optional
from dataclasses import dataclass, field
import math
import random
import time

router = APIRouter()

# ============================
# 1. Pydantic Models (Cập nhật thêm CandleModel)
# ============================

TrendType = Literal["up", "down", "neutral"]


class MarketDepthLevelModel(BaseModel):
    price: float
    quantity: int
    type: Literal["bid", "ask", "marketMaker", "trend", "noise", "stabilizer"]
    botId: Optional[str] = None


class CandleModel(BaseModel):
    timestamp: int  # Start time of the candle
    open: float
    high: float
    low: float
    close: float
    volume: float


class SimulatedMarketDataModel(BaseModel):
    symbol: str
    price: float  # Giá hiện tại (Last price)
    volume: float
    timestamp: int

    # ✅ THÊM: Dữ liệu nến để vẽ biểu đồ
    currentCandle: Optional[CandleModel] = None
    history: List[CandleModel] = Field(default_factory=list)

    bidDepth: List[MarketDepthLevelModel]
    askDepth: List[MarketDepthLevelModel]
    trend: TrendType
    volatility: float
    vwap: Optional[float] = None
    rsi: Optional[float] = None
    volumeProfile: Dict[float, float] = Field(default_factory=dict)


class OrderResultModel(BaseModel):
    success: bool
    filledPrice: Optional[float] = None
    filledQuantity: Optional[int] = None


class UserOrderModel(BaseModel):
    id: str
    symbol: str
    type: Literal["buy", "sell"]
    orderType: Literal["Market", "Limit"]
    quantity: int
    price: Optional[float] = None


# ============================
# 2. Engine Data Structures
# ============================

@dataclass
class Candle:
    timestamp: float
    open: float
    high: float
    low: float
    close: float
    volume: float


@dataclass
class MarketDepthLevel:
    price: float
    quantity: int
    type: str
    botId: Optional[str] = None
    expiry: Optional[float] = None
    createdTime: Optional[float] = None


@dataclass
class SimulatedMarketData:
    symbol: str
    price: float
    volume: float
    timestamp: float

    # ✅ THÊM: Quản lý nến
    current_candle: Optional[Candle] = None
    history: List[Candle] = field(default_factory=list)
    last_trade_time: float = 0.0  # Để kiểm soát tần suất giao dịch

    bidDepth: List[MarketDepthLevel] = field(default_factory=list)
    askDepth: List[MarketDepthLevel] = field(default_factory=list)
    trend: TrendType = "neutral"
    volatility: float = 0.003
    vwap: Optional[float] = None
    rsi: Optional[float] = None
    volumeProfile: Dict[float, float] = field(default_factory=dict)


# ============================
# 3. Config Parameters
# ============================

PARAMS = {
    "BASE_PRICE_VOLATILITY": 0.003,
    "MARKET_MAKER_BASE_SPREAD": 50,
    "MIN_BID_ASK_LEVELS": 5,
    "MAX_LEVELS": 25,

    # ✅ CẤU HÌNH MỚI
    "TRANSACTIONS_PER_MINUTE": 5,  # 5 giao dịch / phút
    "CANDLE_INTERVAL_MS": 60 * 1000,  # 1 nến = 1 phút
    "INITIAL_HISTORY_CANDLES": 10,  # Tạo sẵn 10 nến
}

# Tính khoảng cách giữa các giao dịch (ms)
# 60s / 5 = 12s một giao dịch
TRADE_INTERVAL_MS = (60 * 1000) / PARAMS["TRANSACTIONS_PER_MINUTE"]

SYMBOLS = {
    "VIC.VN": {"price": 45200, "lotSize": 100, "tickSize": 100},
    "VHM.VN": {"price": 55500, "lotSize": 100, "tickSize": 100},
    "VCB.VN": {"price": 82700, "lotSize": 100, "tickSize": 100},
    "TCB.VN": {"price": 22950, "lotSize": 100, "tickSize": 50},
    "FPT.VN": {"price": 123500, "lotSize": 100, "tickSize": 500},
}


# ============================
# Utility
# ============================

def now_ms() -> float:
    return time.time() * 1000.0


def randn() -> float:
    u1 = random.random()
    u2 = random.random()
    return math.sqrt(-2 * math.log(u1)) * math.cos(2 * math.pi * u2)


# ============================
# 4. Market Engine Logic
# ============================

class MarketSimulationEngine:
    def __init__(self) -> None:
        self.market_data: Dict[str, SimulatedMarketData] = {}
        # Lịch sử giá tick (để tính RSI/Volatility) vẫn giữ riêng
        self.price_history_ticks: Dict[str, List[float]] = {}

        self._init_markets()

    def _init_markets(self) -> None:
        """
        Khởi tạo market với 10 cây nến lịch sử.
        """
        current_time = now_ms()

        for symbol, info in SYMBOLS.items():
            start_price = info["price"]

            # Tạo object data
            md = SimulatedMarketData(
                symbol=symbol,
                price=start_price,
                volume=0,
                timestamp=current_time,
                last_trade_time=current_time
            )

            # ✅ GEN 10 CÂY NẾN QUÁ KHỨ
            # Bắt đầu từ 10 phút trước
            history_start_time = current_time - (PARAMS["INITIAL_HISTORY_CANDLES"] * PARAMS["CANDLE_INTERVAL_MS"])

            simulated_price = start_price

            for i in range(PARAMS["INITIAL_HISTORY_CANDLES"]):
                candle_time = history_start_time + (i * PARAMS["CANDLE_INTERVAL_MS"])

                # Tạo Open, High, Low, Close ngẫu nhiên cho quá khứ
                c_open = simulated_price
                # Biến động trong nến khoảng 0.5%
                change = simulated_price * 0.005 * randn()
                c_close = simulated_price + change
                c_high = max(c_open, c_close) + (simulated_price * 0.002 * random.random())
                c_low = min(c_open, c_close) - (simulated_price * 0.002 * random.random())
                c_vol = 10000 + random.random() * 5000

                # Làm tròn theo ticksize
                tick = info["tickSize"]
                c_open = round(c_open / tick) * tick
                c_high = round(c_high / tick) * tick
                c_low = round(c_low / tick) * tick
                c_close = round(c_close / tick) * tick

                # Lưu vào history
                candle = Candle(candle_time, c_open, c_high, c_low, c_close, c_vol)
                md.history.append(candle)

                simulated_price = c_close  # Giá đóng cửa là giá mở cửa nến sau

            # Set trạng thái hiện tại bằng giá cuối cùng
            md.price = simulated_price
            md.timestamp = current_time

            # Khởi tạo cây nến hiện tại (đang chạy)
            md.current_candle = Candle(
                timestamp=current_time,
                open=simulated_price,
                high=simulated_price,
                low=simulated_price,
                close=simulated_price,
                volume=0
            )

            self.market_data[symbol] = md
            self.price_history_ticks[symbol] = [simulated_price]

            # Init order book giả
            self._update_order_book(md)

    def get_market(self, symbol: str) -> SimulatedMarketData:
        if symbol not in self.market_data:
            raise KeyError(symbol)
        return self.market_data[symbol]

    def step(self, symbol: str) -> SimulatedMarketData:
        """
        Logic mới:
        - Kiểm tra xem đã đủ 12s chưa. Nếu chưa -> trả về state cũ.
        - Nếu đủ -> Sinh giá mới, cập nhật vào current_candle.
        - Nếu current_candle vượt quá 1 phút -> Đẩy vào history, tạo nến mới.
        """
        if symbol not in self.market_data:
            raise KeyError(symbol)

        md = self.market_data[symbol]
        now = now_ms()

        # 1. THROTTLE: Kiểm tra xem đã đến lúc trade chưa
        # Nếu chưa đủ 12s (TRADE_INTERVAL_MS) kể từ lần trade cuối -> Skip tính toán
        if now - md.last_trade_time < TRADE_INTERVAL_MS:
            # Chỉ update timestamp nhẹ để FE biết server còn sống, nhưng giá giữ nguyên
            # md.timestamp = now (Tuỳ chọn: nếu muốn biểu đồ đứng yên thì không update)
            return md

        # Đã đến lúc trade mới
        md.last_trade_time = now
        md.timestamp = now

        # 2. Tính giá mới (Random Walk đơn giản hóa)
        tick = SYMBOLS[symbol]["tickSize"]
        # Biến động nhẹ
        move_pct = PARAMS["BASE_PRICE_VOLATILITY"] * randn() * 0.5
        new_price = md.price * (1 + move_pct)

        # Làm tròn
        new_price = max(tick, round(new_price / tick) * tick)
        volume_tick = 500 + random.random() * 1000  # Volume cho tick này

        md.price = new_price
        md.volume += volume_tick  # Volume tổng tích lũy (hoặc tick volume tuỳ FE)

        self.price_history_ticks[symbol].append(new_price)

        # 3. Cập nhật nến (Candle Logic)
        if md.current_candle:
            c = md.current_candle

            # Kiểm tra xem nến này đã hết thời gian (1 phút) chưa?
            candle_elapsed = now - c.timestamp

            if candle_elapsed >= PARAMS["CANDLE_INTERVAL_MS"]:
                # == ĐÓNG NẾN CŨ ==
                md.history.append(c)  # Lưu nến cũ vào lịch sử
                # Giới hạn lịch sử gửi về FE (ví dụ 50 nến gần nhất để nhẹ payload)
                if len(md.history) > 100:
                    md.history.pop(0)

                # == MỞ NẾN MỚI ==
                # Thời gian nến mới bắt đầu từ thời điểm kết thúc nến cũ (tròn phút)
                # Hoặc đơn giản là lấy `now`
                new_candle_ts = c.timestamp + PARAMS["CANDLE_INTERVAL_MS"]
                md.current_candle = Candle(
                    timestamp=new_candle_ts,
                    open=new_price,
                    high=new_price,
                    low=new_price,
                    close=new_price,
                    volume=volume_tick
                )
            else:
                # == CẬP NHẬT NẾN ĐANG CHẠY ==
                c.close = new_price
                if new_price > c.high: c.high = new_price
                if new_price < c.low: c.low = new_price
                c.volume += volume_tick
        else:
            # Fallback nếu chưa có nến (hiếm khi xảy ra do init rồi)
            md.current_candle = Candle(now, new_price, new_price, new_price, new_price, volume_tick)

        # 4. Update các thứ râu ria (Orderbook, RSI, etc)
        self._update_order_book(md)
        # (Có thể thêm logic RSI, VWAP ở đây nếu cần chính xác)

        return md

    # ... (Giữ nguyên process_user_order) ...
    def process_user_order(self, order: UserOrderModel) -> OrderResultModel:
        # Code cũ giữ nguyên, không ảnh hưởng
        symbol = order.symbol
        if symbol not in self.market_data:
            return OrderResultModel(success=False)
        md = self.market_data[symbol]
        # Giả lập khớp lệnh luôn thành công ở giá hiện tại cho nhanh
        return OrderResultModel(success=True, filledPrice=md.price, filledQuantity=order.quantity)

    # ... (Giữ nguyên các hàm internal helper như _best_bid, nhưng sửa update_order_book một chút) ...

    def _update_order_book(self, md: SimulatedMarketData) -> None:
        """
        Tạo lại order book dựa trên giá md.price hiện tại
        """
        now = now_ms()
        tick = SYMBOLS[md.symbol]["tickSize"]

        # Xóa sạch làm lại cho mượt (hoặc giữ logic cũ)
        md.bidDepth = []
        md.askDepth = []

        base_spread = PARAMS["MARKET_MAKER_BASE_SPREAD"]

        # Tạo 5 bids, 5 asks
        for i in range(5):
            spread = base_spread * (1 + i * 0.2)

            bid_price = max(tick, round((md.price - spread) / tick) * tick)
            ask_price = round((md.price + spread) / tick) * tick

            qty = random.randint(100, 500)

            md.bidDepth.append(MarketDepthLevel(bid_price, qty, "marketMaker", createdTime=now))
            md.askDepth.append(MarketDepthLevel(ask_price, qty, "marketMaker", createdTime=now))

        md.bidDepth.sort(key=lambda x: x.price, reverse=True)
        md.askDepth.sort(key=lambda x: x.price)

    # ---------- Convert to Pydantic ----------

    def to_model(self, md: SimulatedMarketData) -> SimulatedMarketDataModel:
        # Convert Candle dataclass -> CandleModel
        hist_models = [
            CandleModel(
                timestamp=int(c.timestamp),
                open=c.open, high=c.high, low=c.low, close=c.close, volume=c.volume
            ) for c in md.history
        ]

        curr_candle_model = None
        if md.current_candle:
            c = md.current_candle
            curr_candle_model = CandleModel(
                timestamp=int(c.timestamp),
                open=c.open, high=c.high, low=c.low, close=c.close, volume=c.volume
            )

        return SimulatedMarketDataModel(
            symbol=md.symbol,
            price=md.price,
            volume=md.volume,
            timestamp=int(md.timestamp),

            # Data mới cho chart
            history=hist_models,
            currentCandle=curr_candle_model,

            bidDepth=[
                MarketDepthLevelModel(price=l.price, quantity=l.quantity, type=l.type, botId=l.botId)  # type: ignore
                for l in md.bidDepth
            ],
            askDepth=[
                MarketDepthLevelModel(price=l.price, quantity=l.quantity, type=l.type, botId=l.botId)  # type: ignore
                for l in md.askDepth
            ],
            trend=md.trend,
            volatility=md.volatility,
            vwap=md.vwap,
            rsi=md.rsi,
            volumeProfile=md.volumeProfile,
        )


engine = MarketSimulationEngine()


# ============================
# API Routes
# ============================

@router.get("/{symbol}/next", response_model=SimulatedMarketDataModel)
def get_next_tick(symbol: str):
    try:
        md = engine.step(symbol)
    except KeyError:
        raise HTTPException(status_code=404, detail="Symbol not found")
    return engine.to_model(md)

# Giữ lại các route khác (get_market, post_order) như cũ