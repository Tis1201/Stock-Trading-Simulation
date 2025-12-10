// api/src/backtest/infrastructure/dto/backtest-result.dto.ts

export type BacktestStatus = 'COMPLETED' | 'FAILED';

export interface BacktestTradeDto {
  entryTime: number;   // unix timestamp (seconds)
  exitTime: number;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  profit: number;
  side: 'buy' | 'sell';
}

export interface EquityPointDto {
  time: number;   // unix timestamp
  value: number;  // equity or drawdown value
}

export interface BacktestResultMessageDto {
  job_id: number;
  status: BacktestStatus;

  netProfit: number;
  winRate: number;        // 0.55 = 55%
  maxDrawdown: number;    // 0.18 = 18%
  profitFactor: number;
  totalTrades: number;

  equityCurve: EquityPointDto[];
  underwater: EquityPointDto[];
  trades: BacktestTradeDto[];
}
