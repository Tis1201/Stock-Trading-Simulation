export type BacktestStatus = 'PENDING'|'RUNNING'|'COMPLETED'|'FAILED';

export class BacktestJobEntity {
  id!: number;
  user_id!: number;
  strategy_id!: number;
  status!: BacktestStatus;
  data_from?: Date;
  data_to?: Date;
  price_source!: 'HISTORICAL'|'SIM_PRIVATE'|'SIM_PUBLIC';
  session_id?: number|null;
  initial_capital!: number;
  commission_rate!: number;
  job_config?: any;

  // metrics
  total_return?: number;
  annual_return?: number;
  max_drawdown?: number;
  sharpe_ratio?: number;
  win_rate?: number;
  total_trades?: number;
  profitable_trades?: number;

  error_message?: string;
  started_at?: Date;
  completed_at?: Date;
  created_at!: Date;
  updated_at!: Date;

  trades?: Array<{
    stock_symbol: string;
    trade_type: 'BUY'|'SELL';
    trade_date: Date;
    quantity: number;
    price_per_share: number;
    commission: number;
    total_amount: number;
    portfolio_value?: number|null;
  }>;
}
