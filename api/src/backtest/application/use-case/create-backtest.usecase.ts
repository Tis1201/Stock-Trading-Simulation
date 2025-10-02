import { Injectable, Inject } from '@nestjs/common';
import type { BacktestRepository } from '../../domain/ports/backtest.repository';
import type { MessageBusPort } from '../../domain/ports/message-bus.port';
import { CreateBacktestDto } from '../dto/create-backtest.dto';
import { StrategyMapper } from '../mapper/strategy.mapper';
import { BacktestService } from 'src/backtest/domain/services/backtest.service';
import { randomUUID } from 'crypto';

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

    return { job_id: job.id, status: 'PENDING' };
  }

  async getBacktestResult(jobId: number) {
    return this.repo.getJobWithTrades(jobId);
  }
}
