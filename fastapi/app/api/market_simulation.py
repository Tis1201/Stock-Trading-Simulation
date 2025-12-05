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
# Pydantic models (match FE types)
# ============================

TrendType = Literal["up", "down", "neutral"]

class MarketDepthLevelModel(BaseModel):
    price: float
    quantity: int
    type: Literal["bid", "ask", "marketMaker", "trend", "noise", "stabilizer"]
    botId: Optional[str] = None

class SimulatedMarketDataModel(BaseModel):
    symbol: str
    price: float
    volume: float
    timestamp: int
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
    # ánh xạ từ FE Order
    id: str
    symbol: str
    type: Literal["buy", "sell"]
    orderType: Literal["Market", "Limit"]
    quantity: int
    price: Optional[float] = None

# ============================
# Engine data structures
# ============================

@dataclass
class MarketDepthLevel:
    price: float
    quantity: int
    type: str          # "bid" | "ask" | "marketMaker" | "trend" | "noise" | "stabilizer"
    botId: Optional[str] = None
    expiry: Optional[float] = None
    createdTime: Optional[float] = None

@dataclass
class SimulatedMarketData:
    symbol: str
    price: float
    volume: float
    timestamp: float
    bidDepth: List[MarketDepthLevel] = field(default_factory=list)
    askDepth: List[MarketDepthLevel] = field(default_factory=list)
    trend: TrendType = "neutral"
    volatility: float = 0.003
    vwap: Optional[float] = None
    rsi: Optional[float] = None
    volumeProfile: Dict[float, float] = field(default_factory=dict)

@dataclass
class BotPosition:
    botId: str
    symbol: str
    quantity: int = 0
    avgPrice: float = 0.0
    realizedPnL: float = 0.0

@dataclass
class BotOrder:
    id: str
    botId: str
    symbol: str
    type: Literal["buy", "sell"]
    orderType: Literal["Market", "Limit"]
    quantity: int
    price: float
    status: Literal["pending", "filled", "cancelled"] = "pending"
    expiryTime: Optional[float] = None

# ============================
# Parameters (port from TS, đơn giản lại chút)
# ============================

PARAMS = {
    "BASE_PRICE_VOLATILITY": 0.003,        # 0.3% / sqrt(day)
    "PRICE_UPDATE_INTERVAL_SEC": 1.0,      # mỗi tick ~ 1s
    "VOLATILITY_WINDOW": 20,
    "MARKET_MAKER_BASE_SPREAD": 50,
    "MARKET_MAKER_QTY_RANGE": (100, 500),
    "MIN_BID_ASK_LEVELS": 5,
    "MAX_LEVELS": 25,
    "MAX_SPREAD_MULTIPLIER": 3,
    "GAP_FILL_THRESHOLD": 0.02,
    "NOISE_STD_MULTIPLIER": 0.5,           # thêm noise vào giá
    "IMBALANCE_IMPACT": 0.002,             # tác động order imbalance vào giá
    "TREND_IMPACT": 0.004,                 # tác động trend mỗi tick
}

SYMBOLS = {
    "VIC.VN": {"price": 45200, "lotSize": 100, "tickSize": 100},
    "VHM.VN": {"price": 55500, "lotSize": 100, "tickSize": 100},
    "VCB.VN": {"price": 82700, "lotSize": 100, "tickSize": 100},
    "TCB.VN": {"price": 22950, "lotSize": 100, "tickSize": 50},
    "FPT.VN": {"price": 123500, "lotSize": 100, "tickSize": 500},
    "VNM.VN": {"price": 48200, "lotSize": 100, "tickSize": 100},
    "HPG.VN": {"price": 18850, "lotSize": 100, "tickSize": 50},
    "MSN.VN": {"price": 67800, "lotSize": 100, "tickSize": 100},
}

# ============================
# Utility
# ============================

def now_ms() -> float:
    return time.time() * 1000.0

def randn() -> float:
    # standard normal (Box–Muller)
    u1 = random.random()
    u2 = random.random()
    return math.sqrt(-2 * math.log(u1)) * math.cos(2 * math.pi * u2)

# ============================
# Market Engine (backend version of MarketSimulationService)
# ============================

class MarketSimulationEngine:
    def __init__(self) -> None:
        self.market_data: Dict[str, SimulatedMarketData] = {}
        self.price_history: Dict[str, List[float]] = {}
        self.volume_history: Dict[str, List[float]] = {}
        self.bot_positions: Dict[str, BotPosition] = {}
        self.bot_orders: Dict[str, BotOrder] = {}
        self.pending_user_orders: Dict[str, UserOrderModel] = {}

        self._init_markets()
        self._init_bots()  # ở đây mình đơn giản hóa bot nhưng vẫn giữ concept marketMaker / trend / noise

    # ---------- INIT ----------

    def _init_markets(self) -> None:
        for symbol, info in SYMBOLS.items():
            price = info["price"]
            md = SimulatedMarketData(
                symbol=symbol,
                price=price,
                volume=2000,
                timestamp=now_ms(),
            )
            # volume profile tạo xung quanh giá hiện tại
            for i in range(50):
                level_price = price * (1 + (i - 25) * 0.002)
                md.volumeProfile[level_price] = 0.0
            self.market_data[symbol] = md
            self.price_history[symbol] = [price]
            self.volume_history[symbol] = [md.volume]

    def _init_bots(self) -> None:
        # market maker bots — chỉ để tạo order book (FE không cần biết chi tiết từng bot)
        i = 0
        for symbol in SYMBOLS.keys():
            for k in range(5):  # 5 market maker / symbol
                bot_id = f"mm-{symbol}-{k}"
                self.bot_positions[bot_id] = BotPosition(
                    botId=bot_id,
                    symbol=symbol,
                    quantity=0,
                    avgPrice=SYMBOLS[symbol]["price"],
                )
                i += 1

    # ---------- PUBLIC API ----------

    def get_market(self, symbol: str) -> SimulatedMarketData:
        if symbol not in self.market_data:
            raise KeyError(symbol)
        return self.market_data[symbol]

    def step(self, symbol: str) -> SimulatedMarketData:
        """
        Chạy 1 bước mô phỏng cho symbol:
        - Cập nhật giá theo GBM + volatility + trend + order imbalance
        - Update order book từ market makers + noise
        - Tính RSI, VWAP
        - Giải quyết các pending bot order / user order
        """
        if symbol not in self.market_data:
            raise KeyError(symbol)

        md = self.market_data[symbol]
        dt_days = PARAMS["PRICE_UPDATE_INTERVAL_SEC"] / (252 * 24 * 60 * 60)

        # 1) Base GBM movement
        base_sigma = md.volatility or PARAMS["BASE_PRICE_VOLATILITY"]
        z = randn()
        gbm_move = math.exp(-0.5 * base_sigma**2 * dt_days + base_sigma * math.sqrt(dt_days) * z)
        new_price = md.price * gbm_move

        # 2) Trend effect (dựa trên RSI & momentum)
        momentum = self._calculate_momentum(symbol)
        trend_bias = 0.0
        if momentum > 0.002:
            trend_bias += PARAMS["TREND_IMPACT"]
            md.trend = "up"
        elif momentum < -0.002:
            trend_bias -= PARAMS["TREND_IMPACT"]
            md.trend = "down"
        else:
            md.trend = "neutral"

        new_price *= (1.0 + trend_bias)

        # 3) Order imbalance impact
        imbalance = self._calculate_order_imbalance(md)
        new_price *= (1.0 + PARAMS["IMBALANCE_IMPACT"] * imbalance)

        # 4) Noise (để nến không nằm ngang)
        noise_sigma = base_sigma * PARAMS["NOISE_STD_MULTIPLIER"]
        new_price *= math.exp(noise_sigma * randn())

        # Clamp & tick size
        tick = SYMBOLS[symbol]["tickSize"]
        new_price = max(tick, round(new_price / tick) * tick)

        md.price = new_price
        md.timestamp = now_ms()
        # volume = base + noise + chút ảnh hưởng momentum
        base_volume = 2000
        md.volume = base_volume * (1.0 + abs(momentum) * 20.0 + abs(imbalance) * 5.0)
        # update history
        self._update_history(symbol, md.price, md.volume)

        # 5) Update order book với market makers + noise
        self._update_order_book(md)

        # 6) Technical indicators
        self._update_technical_indicators(md, symbol)

        # 7) TODO: nếu muốn có bot–bot trade / user order fill phức tạp, có thể thêm block matching ở đây.
        # Ở bản đơn giản này, mình chỉ để giá chạy liên tục và order book phản ánh giá.

        return md

    def process_user_order(self, order: UserOrderModel) -> OrderResultModel:
        """
        Mô phỏng khớp lệnh user với order book.
        Đơn giản:
          - Market order: khớp với best bid/ask
          - Limit order: nếu Cross market thì khớp; còn lại coi như chưa khớp (success=False).
        """
        symbol = order.symbol
        if symbol not in self.market_data:
            return OrderResultModel(success=False)

        md = self.market_data[symbol]

        if order.orderType == "Market":
            if order.type == "buy":
                best_ask = self._best_ask(md)
                if best_ask is None:
                    return OrderResultModel(success=False)
                return OrderResultModel(
                    success=True,
                    filledPrice=best_ask.price,
                    filledQuantity=order.quantity,
                )
            else:
                best_bid = self._best_bid(md)
                if best_bid is None:
                    return OrderResultModel(success=False)
                return OrderResultModel(
                    success=True,
                    filledPrice=best_bid.price,
                    filledQuantity=order.quantity,
                )

        # Limit
        limit_price = order.price or md.price
        if order.type == "buy":
            # nếu giá limit >= best ask => khớp
            best_ask = self._best_ask(md)
            if best_ask and limit_price >= best_ask.price:
                price_fill = best_ask.price
                return OrderResultModel(
                    success=True,
                    filledPrice=price_fill,
                    filledQuantity=order.quantity,
                )
        else:
            best_bid = self._best_bid(md)
            if best_bid and limit_price <= best_bid.price:
                price_fill = best_bid.price
                return OrderResultModel(
                    success=True,
                    filledPrice=price_fill,
                    filledQuantity=order.quantity,
                )

        # chưa khớp
        return OrderResultModel(success=False)

    # ---------- INTERNAL LOGIC ----------

    def _best_bid(self, md: SimulatedMarketData) -> Optional[MarketDepthLevel]:
        bids = [l for l in md.bidDepth if l.quantity > 0]
        if not bids:
            return None
        return max(bids, key=lambda l: l.price)

    def _best_ask(self, md: SimulatedMarketData) -> Optional[MarketDepthLevel]:
        asks = [l for l in md.askDepth if l.quantity > 0]
        if not asks:
            return None
        return min(asks, key=lambda l: l.price)

    def _calculate_order_imbalance(self, md: SimulatedMarketData) -> float:
        total_bid = sum(l.quantity for l in md.bidDepth)
        total_ask = sum(l.quantity for l in md.askDepth)
        if total_bid + total_ask == 0:
            return 0.0
        return (total_bid - total_ask) / (total_bid + total_ask)

    def _calculate_momentum(self, symbol: str) -> float:
        prices = self.price_history.get(symbol, [])
        if len(prices) < 5:
            return 0.0
        recent = prices[-5:]
        return (recent[-1] - recent[0]) / recent[0]

    def _update_history(self, symbol: str, price: float, volume: float) -> None:
        ph = self.price_history.setdefault(symbol, [])
        vh = self.volume_history.setdefault(symbol, [])
        ph.append(price)
        vh.append(volume)

        max_len = PARAMS["VOLATILITY_WINDOW"] * 10
        if len(ph) > max_len:
            del ph[: len(ph) - max_len]
        if len(vh) > 100:
            del vh[: len(vh) - 100]

        # update volatility (σ) dựa trên returns
        if len(ph) > 2:
            rets = [math.log(ph[i] / ph[i - 1]) for i in range(1, len(ph))]
            if len(rets) >= 2:
                mean = sum(rets) / len(rets)
                var = sum((r - mean) ** 2 for r in rets) / (len(rets) - 1)
                vol = math.sqrt(var * 252)
                vol = max(PARAMS["BASE_PRICE_VOLATILITY"] * 0.5,
                          min(PARAMS["BASE_PRICE_VOLATILITY"] * 2, vol))
                self.market_data[symbol].volatility = vol

    def _update_order_book(self, md: SimulatedMarketData) -> None:
        """
        Tạo order book thực tế hơn:
        - giữ lại một phần order cũ
        - thêm market maker levels xung quanh giá
        - đảm bảo tối thiểu N levels mỗi side
        """
        now = now_ms()

        # lọc bỏ order quá cũ
        md.bidDepth = [l for l in md.bidDepth if not l.expiry or l.expiry > now]
        md.askDepth = [l for l in md.askDepth if not l.expiry or l.expiry > now]

        # giới hạn số levels
        md.bidDepth.sort(key=lambda l: l.price, reverse=True)
        md.askDepth.sort(key=lambda l: l.price)
        md.bidDepth = md.bidDepth[:PARAMS["MAX_LEVELS"]]
        md.askDepth = md.askDepth[:PARAMS["MAX_LEVELS"]]

        # nếu thiếu levels -> thêm market maker
        needed_bids = max(0, PARAMS["MIN_BID_ASK_LEVELS"] - len(md.bidDepth))
        needed_asks = max(0, PARAMS["MIN_BID_ASK_LEVELS"] - len(md.askDepth))

        base_spread = PARAMS["MARKET_MAKER_BASE_SPREAD"]
        tick = SYMBOLS[md.symbol]["tickSize"]

        for i in range(needed_bids):
            level_spread = base_spread * (1 + i * 0.5)
            price = max(tick, round((md.price - level_spread) / tick) * tick)
            qty = random.randint(*PARAMS["MARKET_MAKER_QTY_RANGE"])
            md.bidDepth.append(
                MarketDepthLevel(
                    price=price,
                    quantity=qty,
                    type="marketMaker",
                    expiry=now + random.randint(15000, 45000),
                    createdTime=now,
                )
            )

        for i in range(needed_asks):
            level_spread = base_spread * (1 + i * 0.5)
            price = round((md.price + level_spread) / tick) * tick
            qty = random.randint(*PARAMS["MARKET_MAKER_QTY_RANGE"])
            md.askDepth.append(
                MarketDepthLevel(
                    price=price,
                    quantity=qty,
                    type="marketMaker",
                    expiry=now + random.randint(15000, 45000),
                    createdTime=now,
                )
            )

        # sort final
        md.bidDepth.sort(key=lambda l: l.price, reverse=True)
        md.askDepth.sort(key=lambda l: l.price)

    def _update_technical_indicators(self, md: SimulatedMarketData, symbol: str) -> None:
        prices = self.price_history.get(symbol, [])
        volumes = self.volume_history.get(symbol, [])
        if len(prices) >= 14:
            # RSI-like
            recent = prices[-14:]
            gains = 0.0
            losses = 0.0
            for i in range(1, len(recent)):
                diff = recent[i] - recent[i - 1]
                if diff > 0:
                    gains += diff
                else:
                    losses -= diff
            avg_gain = gains / 14
            avg_loss = losses / 14 if losses > 0 else 1e-9
            rs = avg_gain / avg_loss
            md.rsi = 100 - 100 / (1 + rs)

        if len(prices) >= 10 and len(volumes) >= 10:
            p = prices[-10:]
            v = volumes[-10:]
            total_val = sum(p[i] * v[i] for i in range(10))
            total_vol = sum(v)
            if total_vol > 0:
                md.vwap = total_val / total_vol

        # volume profile: cộng volume vào gần giá hiện tại
        lvl_price = round(md.price / SYMBOLS[md.symbol]["tickSize"]) * SYMBOLS[md.symbol]["tickSize"]
        current = md.volumeProfile.get(lvl_price, 0.0)
        md.volumeProfile[lvl_price] = current + md.volume

    # ---------- Convert to Pydantic ----------

    def to_model(self, md: SimulatedMarketData) -> SimulatedMarketDataModel:
        return SimulatedMarketDataModel(
            symbol=md.symbol,
            price=md.price,
            volume=md.volume,
            timestamp=int(md.timestamp),
            bidDepth=[
                MarketDepthLevelModel(
                    price=l.price,
                    quantity=l.quantity,
                    type=l.type,  # type: ignore
                    botId=l.botId,
                )
                for l in md.bidDepth
            ],
            askDepth=[
                MarketDepthLevelModel(
                    price=l.price,
                    quantity=l.quantity,
                    type=l.type,  # type: ignore
                    botId=l.botId,
                )
                for l in md.askDepth
            ],
            trend=md.trend,
            volatility=md.volatility,
            vwap=md.vwap,
            rsi=md.rsi,
            volumeProfile=md.volumeProfile,
        )

# Singleton engine
engine = MarketSimulationEngine()

# ============================
# FastAPI routes
# ============================

@router.get("/{symbol}", response_model=SimulatedMarketDataModel)
def get_market(symbol: str):
    try:
        md = engine.get_market(symbol)
    except KeyError:
        raise HTTPException(status_code=404, detail="Symbol not found")
    return engine.to_model(md)


@router.get("/{symbol}/next", response_model=SimulatedMarketDataModel)
def get_next_tick(symbol: str):
    try:
        md = engine.step(symbol)
    except KeyError:
        raise HTTPException(status_code=404, detail="Symbol not found")
    return engine.to_model(md)


@router.post("/orders", response_model=OrderResultModel)
def post_order(order: UserOrderModel):
    result = engine.process_user_order(order)
    return result
