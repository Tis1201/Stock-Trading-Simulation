import { Injectable, Inject } from '@nestjs/common';
import type { BacktestRepository } from '../ports/backtest.repository';
import type { MessageBusPort } from '../ports/message-bus.port';
import { CreateBacktestDto } from '../dto/create-backtest.dto';
import { StrategyMapper } from '../mapper/strategy.mapper';

@Injectable()
export class CreateBacktestUseCase {
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

    const job = await this.repo.createJob(userId, {
      strategy_id: strategyId,
      data_from: new Date(dto.dataFrom),
      data_to: new Date(dto.dataTo),
      price_source: dto.priceSource,
      session_id: dto.sessionId ?? null,
      initial_capital: dto.initialCapital,
      commission_rate: dto.commissionRate,
      job_config: dto.jobConfig ?? {},
    });

    await this.bus.publishBacktestRequested({
      job_id: job.id,
      strategy_id: strategyId,
      data_from: dto.dataFrom,
      data_to: dto.dataTo,
      price_source: dto.priceSource,
      session_id: dto.sessionId ?? null,
      initial_capital: dto.initialCapital,
      commission_rate: dto.commissionRate,
      job_config: dto.jobConfig ?? {},
    });

    return { job_id: job.id, status: 'PENDING' };
  }

  async getBacktestResult(jobId: number) {
    return this.repo.getJobWithTrades(jobId);
  }
}
