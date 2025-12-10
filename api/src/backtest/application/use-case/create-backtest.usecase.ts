import { Inject, Injectable } from '@nestjs/common';
import type { BacktestRepository } from '../../domain/ports/backtest.repository';
import type { MessageBusPort } from '../../domain/ports/message-bus.port';
import { CreateBacktestDto } from '../dto/create-backtest.dto';
import { StrategyMapper } from '../mapper/strategy.mapper';
import { BacktestService } from 'src/backtest/domain/services/backtest.service';

function toNumber(value: any): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

@Injectable()
export class CreateBacktestUseCase implements BacktestService {
  constructor(
    @Inject('BacktestRepository')
    private readonly repo: BacktestRepository,

    @Inject('MessageBusPort')
    private readonly bus: MessageBusPort,
  ) {}

  async createBacktestJob(userId: number, dto: CreateBacktestDto) {
    const strategyEntity = StrategyMapper.fromDto(dto.strategy);
    const { strategyId } = await this.repo.createStrategyWithRules(
      userId,
      strategyEntity,
    );

    const session = dto.sessionId
      ? { id: dto.sessionId }
      : await this.repo.createSession(userId);

    const job = await this.repo.createJob(userId, {
      symbol: dto.symbol,
      strategy_id: strategyId,
      data_from: new Date(dto.dataFrom),
      data_to: new Date(dto.dataTo),
      price_source: dto.priceSource,
      session_id: dto.sessionId ?? session.id,
      initial_capital: dto.initialCapital,
      commission_rate: dto.commissionRate,
      job_config: dto.jobConfig ?? {},
    });

    await this.bus.publishBacktestRequested({
      job_id: job.id,
      symbol: dto.symbol,
      strategy_id: strategyId,
      data_from: dto.dataFrom,
      data_to: dto.dataTo,
      price_source: dto.priceSource,
      session_id: dto.sessionId ?? session.id,
      initial_capital: dto.initialCapital,
      commission_rate: dto.commissionRate,
      job_config: dto.jobConfig ?? {},
    });

    // Khi tạo job chỉ có thể trả về PENDING
    return { job_id: job.id, status: 'PENDING' };
  }

  async getBacktestResult(jobId: number) {
    const job: any = await this.repo.getJobWithTrades(jobId);

    // Đọc result đã lưu từ FastAPI trong job_config.result
    const jobConfig = (job.job_config) || {};
    const result = jobConfig.result || {};

    const netProfit = toNumber(result.netProfit);
    const winRate =
      result.winRate !== undefined
        ? result.winRate
        : toNumber(job.win_rate) ?? 0;
    const maxDrawdown =
      result.maxDrawdown !== undefined
        ? result.maxDrawdown
        : toNumber(job.max_drawdown) ?? 0;
    const profitFactor = toNumber(result.profitFactor);

    const totalTrades =
      result.totalTrades !== undefined
        ? result.totalTrades
        : job.total_trades ?? 0;
    const profitableTrades =
      result.profitableTrades !== undefined
        ? result.profitableTrades
        : job.profitable_trades ?? 0;

    const equityCurve = Array.isArray(result.equityCurve)
      ? result.equityCurve
      : [];
    const underwater = Array.isArray(result.underwater)
      ? result.underwater
      : [];

    // Ưu tiên dùng trades từ engine (FastAPI) nếu có
    let trades: any[] = [];
    if (Array.isArray(result.trades) && result.trades.length > 0) {
      trades = result.trades;
    } else if (Array.isArray(job.trades)) {
      trades = job.trades.map((t: any) => ({
        entryTime: Math.floor(new Date(t.trade_date).getTime() / 1000),
        exitTime: Math.floor(new Date(t.trade_date).getTime() / 1000),
        entryPrice: Number(t.price_per_share),
        exitPrice: Number(t.price_per_share),
        quantity: t.quantity,
        // Không có đủ thông tin để tính P&L chính xác, nên để 0
        profit: 0,
        side: t.trade_type === 'sell' ? 'sell' : 'buy',
      }));
    }

    return {
      jobId: job.id,
      symbol: job.symbol,
      status: job.status,
      dataFrom: job.data_from,
      dataTo: job.data_to,
      initialCapital: Number(job.initial_capital),
      netProfit,
      winRate,
      maxDrawdown,
      profitFactor,
      totalTrades,
      profitableTrades,
      equityCurve,
      underwater,
      trades,
    };
  }
}
