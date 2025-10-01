import { CreateBacktestDto } from "../dto/create-backtest.dto";


export interface BacktestService {
  createBacktestJob(userId: number, dto: CreateBacktestDto): Promise<{ job_id: number; status: string }>;
  getBacktestResult(jobId: number): Promise<any>;
}
