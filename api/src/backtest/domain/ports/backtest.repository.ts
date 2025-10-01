import { BacktestJobEntity, BacktestStatus } from '../entities/backtest-job.entity';
import { StrategyEntity } from '../entities/strategy.entity';

export interface BacktestRepository {
  createStrategyWithRules(userId: number, strategy: StrategyEntity): Promise<{ strategyId: number }>;
  createJob(userId: number, dto: {
    strategy_id: number;
    data_from: Date; data_to: Date;
    price_source: 'HISTORICAL'|'SIM_PRIVATE'|'SIM_PUBLIC';
    session_id?: number|null;
    initial_capital: number;
    commission_rate: number;
    job_config?: any;
  }): Promise<BacktestJobEntity>;

  updateJobStatus(jobId: number, patch: Partial<BacktestJobEntity>): Promise<void>;
  getJobWithTrades(jobId: number): Promise<BacktestJobEntity | null>;
}
