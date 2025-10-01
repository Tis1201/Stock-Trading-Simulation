export interface MessageBusPort {
  publishBacktestRequested(payload: {
    job_id: number;
    strategy_id: number;
    data_from: string;
    data_to: string;
    price_source: string;
    session_id?: number|null;
    initial_capital: number;
    commission_rate: number;
    job_config?: any;
  }): Promise<void>;
}
