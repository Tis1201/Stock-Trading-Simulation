# app/models/backtest_models.py
from datetime import date
from typing import Dict, List, Literal, Optional

from pydantic import BaseModel


class BacktestJobMessage(BaseModel):
    job_id: int
    symbol: str
    strategy_id: int
    data_from: date
    data_to: date
    price_source: str
    session_id: Optional[int]
    initial_capital: float
    commission_rate: float
    job_config: Dict


class EquityPoint(BaseModel):
    time: int   # unix timestamp (seconds)
    value: float


class BacktestTrade(BaseModel):
    entryTime: int     # unix timestamp
    exitTime: int
    entryPrice: float
    exitPrice: float
    quantity: float
    profit: float
    side: Literal["buy", "sell"]


class BacktestResultMessage(BaseModel):
    job_id: int
    status: Literal["COMPLETED", "FAILED"]

    netProfit: float
    winRate: float            # 0.55 = 55%
    maxDrawdown: float        # 0.18 = 18%
    profitFactor: float
    totalTrades: int

    equityCurve: List[EquityPoint]
    underwater: List[EquityPoint]
    trades: List[BacktestTrade]
