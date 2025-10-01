import { Injectable } from '@nestjs/common';
import { PrismaClient, PriceSource } from '@prisma/client';
import { BacktestRepository } from '../../domain/ports/backtest.repository';
import { BacktestJobEntity } from '../../domain/entities/backtest-job.entity';

@Injectable()
export class PrismaBacktestRepository implements BacktestRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createStrategyWithRules(userId: number, s: { name: string; description?: string; rules: any[]; }): Promise<{ strategyId: number }> {
    const strategy = await this.prisma.strategy.create({
      data: {
        user_id: userId,
        name: s.name,
        description: s.description ?? null,
        strategy_config: {},  // optional
        is_public: false,
        is_active: true,
        StrategyRule: {
          create: s.rules.map(r => ({
            rule_order: r.rule_order,
            condition: r.condition,
            action: r.action,
            is_active: true
          }))
        }
      },
      select: { id: true }
    });
    return { strategyId: strategy.id };
  }

  async createJob(userId: number, dto: any): Promise<BacktestJobEntity> {
    const job = await this.prisma.backtestJob.create({
      data: {
        user_id: userId,
        strategy_id: dto.strategy_id,
        status: 'PENDING',
        data_from: dto.data_from,
        data_to: dto.data_to,
        price_source: dto.price_source as PriceSource,
        session_id: dto.session_id ?? null,
        owner_user_id: userId,
        initial_capital: dto.initial_capital,
        commission_rate: dto.commission_rate,
        job_config: dto.job_config ?? {}
      }
    });
    return job as unknown as BacktestJobEntity;
  }

  async updateJobStatus(jobId: number, patch: Partial<BacktestJobEntity>): Promise<void> {
    await this.prisma.backtestJob.update({
      where: { id: jobId },
      data: {
        ...('status' in patch ? { status: patch.status } : {}),
        ...('error_message' in patch ? { error_message: patch.error_message } : {}),
        ...('started_at' in patch ? { started_at: patch.started_at } : {}),
        ...('completed_at' in patch ? { completed_at: patch.completed_at } : {}),
        ...('total_return' in patch ? { total_return: patch.total_return } : {}),
        ...('annual_return' in patch ? { annual_return: patch.annual_return } : {}),
        ...('max_drawdown' in patch ? { max_drawdown: patch.max_drawdown } : {}),
        ...('sharpe_ratio' in patch ? { sharpe_ratio: patch.sharpe_ratio } : {}),
        ...('win_rate' in patch ? { win_rate: patch.win_rate } : {}),
        ...('total_trades' in patch ? { total_trades: patch.total_trades } : {}),
        ...('profitable_trades' in patch ? { profitable_trades: patch.profitable_trades } : {}),
      }
    });
  }

  async getJobWithTrades(jobId: number) {
    const job = await this.prisma.backtestJob.findUnique({
      where: { id: jobId },
      include: {
        trades: true
      }
    });
    return job as any;
  }
}
