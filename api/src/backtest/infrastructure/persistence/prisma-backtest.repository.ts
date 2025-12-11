// api/src/backtest/infrastructure/persistence/prisma-backtest.repository.ts

import { Injectable } from '@nestjs/common';
import { PrismaClient, PriceSource } from '@prisma/client';
import { BacktestRepository } from '../../domain/ports/backtest.repository';
import { BacktestJobEntity } from '../../domain/entities/backtest-job.entity';
import { BacktestResultMessageDto } from '../dto/backtest-result.dto';

@Injectable()
export class PrismaBacktestRepository implements BacktestRepository {
  constructor(private readonly prisma: PrismaClient) {}

  // -----------------------------
  // SESSION
  // -----------------------------
  async createSession(userId: number) {
    return await this.prisma.backtestSession.create({
      data: { userId },
    });
  }

  // -----------------------------
  // STRATEGY
  // -----------------------------
  async createStrategyWithRules(
    userId: number,
    s: { name: string; description?: string; rules: any[] },
  ): Promise<{ strategyId: number }> {
    const strategy = await this.prisma.strategy.create({
      data: {
        user_id: userId,
        name: s.name,
        description: s.description ?? null,
        strategy_config: {}, // optional
        is_public: false,
        is_active: true,
        StrategyRule: {
          create: s.rules.map((r) => ({
            rule_order: r.ruleOrder ?? r.rule_order,
            condition: r.condition,
            action: r.action,
            is_active: true,
          })),
        },
      },
      select: { id: true },
    });

    return { strategyId: strategy.id };
  }

  // -----------------------------
  // JOB
  // -----------------------------
  async createJob(userId: number, dto: any): Promise<BacktestJobEntity> {
    const job = await this.prisma.backtestJob.create({
      data: {
        user_id: userId,
        strategy_id: dto.strategy_id,
        symbol: dto.symbol,
        status: 'PENDING',
        data_from: dto.data_from,
        data_to: dto.data_to,
        price_source: dto.price_source as PriceSource,
        market_session_id: dto.market_session_id ?? null,
        backtest_session_id: dto.session_id ?? null,
        owner_user_id: userId,
        initial_capital: dto.initial_capital,
        commission_rate: dto.commission_rate,
        job_config: dto.job_config ?? {},
      },
    });

    return job as unknown as BacktestJobEntity;
  }

  async updateJobStatus(
    jobId: number,
    patch: Partial<BacktestJobEntity>,
  ): Promise<void> {
    await this.prisma.backtestJob.update({
      where: { id: jobId },
      data: {
        ...('status' in patch ? { status: patch.status } : {}),
        ...('error_message' in patch
          ? { error_message: patch.error_message }
          : {}),
        ...('started_at' in patch ? { started_at: patch.started_at } : {}),
        ...('completed_at' in patch
          ? { completed_at: patch.completed_at }
          : {}),
        ...('total_return' in patch
          ? { total_return: patch.total_return }
          : {}),
        ...('annual_return' in patch
          ? { annual_return: patch.annual_return }
          : {}),
        ...('max_drawdown' in patch
          ? { max_drawdown: patch.max_drawdown }
          : {}),
        ...('sharpe_ratio' in patch
          ? { sharpe_ratio: patch.sharpe_ratio }
          : {}),
        ...('win_rate' in patch ? { win_rate: patch.win_rate } : {}),
        ...('total_trades' in patch
          ? { total_trades: patch.total_trades }
          : {}),
        ...('profitable_trades' in patch
          ? { profitable_trades: patch.profitable_trades }
          : {}),
        // ⭐ THÊM DÒNG NÀY ĐỂ LƯU FULL RESULT TỪ FASTAPI
        ...('job_config' in patch ? { job_config: patch.job_config } : {}),
      },
    });
  }

  async getJobWithTrades(jobId: number) {
    const job = await this.prisma.backtestJob.findUnique({
      where: { id: jobId },
      include: {
        trades: true,
        stock: true,
      },
    });

    return job as any;
  }

  // -----------------------------
  // SAVE RESULT TỪ FASTAPI
  // -----------------------------
  /**
   * Lưu toàn bộ kết quả backtest (metrics + trades) cho 1 job.
   * Được gọi bởi RabbitMqAdapter khi nhận message từ FastAPI.
   */
  async saveBacktestResultFromEngine(
    payload: BacktestResultMessageDto,
  ): Promise<void> {
    const jobId = payload.job_id;

    await this.prisma.$transaction(async (tx) => {
      // Lấy job để biết symbol + commission_rate
      const job = await tx.backtestJob.findUnique({
        where: { id: jobId },
        select: {
          symbol: true,
          commission_rate: true,
        },
      });

      if (!job) {
        throw new Error(`BacktestJob ${jobId} not found`);
      }

      // Đếm trade thắng
      const profitableTrades = payload.trades.filter(
        (t) => t.profit > 0,
      ).length;

      // 1) Cập nhật metrics vào BacktestJob
      await tx.backtestJob.update({
        where: { id: jobId },
        data: {
          status: payload.status,
          total_return: payload.netProfit,
          max_drawdown: payload.maxDrawdown,
          win_rate: payload.winRate,
          total_trades: payload.totalTrades,
          profitable_trades: profitableTrades,
          // Có thể map profitFactor vào sharpe_ratio tạm nếu muốn:
          // sharpe_ratio: payload.profitFactor,
          updated_at: new Date(),
          completed_at: new Date(),
        },
      });

      // 2) Xoá trade cũ nếu có (cho trường hợp re-run)
      await tx.backtestTrade.deleteMany({
        where: { backtest_job_id: jobId },
      });

      // 3) Lưu trades mới
      if (payload.trades.length > 0) {
        await tx.backtestTrade.createMany({
          data: payload.trades.map((t) => {
            const qtyInt = Math.round(t.quantity); // schema yêu cầu Int
            const price = t.exitPrice ?? t.entryPrice;
            const total = price * qtyInt;
            const tradeDateSec = t.exitTime || t.entryTime;

            return {
              backtest_job_id: jobId,
              stock_symbol: job.symbol,
              trade_type: t.side, // "buy" | "sell"
              trade_date: new Date(tradeDateSec * 1000),
              quantity: qtyInt,
              price_per_share: price,
              commission: 0, // hoặc Number(job.commission_rate) * total nếu muốn
              total_amount: total,
              portfolio_value: null,
            };
          }),
        });
      }
    });
  }

  async applyEngineResult(payload: any): Promise<void> {
    const jobId = payload.job_id;

    // Lấy job_config cũ để merge
    const job = await this.prisma.backtestJob.findUnique({
      where: { id: jobId },
      select: { initial_capital: true, job_config: true },
    });

    if (!job) {
      console.warn(
        '[PrismaBacktestRepository] Job not found for engine result:',
        jobId,
      );
      return;
    }

    const initialCapital = Number(job.initial_capital);
    const netProfit = Number(payload.netProfit ?? 0);

    // total_return tạm hiểu là % return
    const totalReturnRatio =
      initialCapital > 0 ? netProfit / initialCapital : 0;

    const oldConfig = (job.job_config as any) || {};

    await this.prisma.backtestJob.update({
      where: { id: jobId },
      data: {
        status: payload.status ?? 'COMPLETED',
        max_drawdown: payload.maxDrawdown ?? undefined,
        win_rate: payload.winRate ?? undefined,
        total_trades: payload.totalTrades ?? undefined,
        profitable_trades: Array.isArray(payload.trades)
          ? payload.trades.filter((t: any) => t.profit > 0).length
          : undefined,
        total_return: totalReturnRatio,
        updated_at: new Date(),
        job_config: {
          // ghi đè toàn bộ JSON
          ...(oldConfig || {}),
          result: {
            netProfit: payload.netProfit,
            winRate: payload.winRate,
            maxDrawdown: payload.maxDrawdown,
            profitFactor: payload.profitFactor,
            totalTrades: payload.totalTrades,
            equityCurve: payload.equityCurve,
            underwater: payload.underwater,
            trades: payload.trades,
          },
        },
      },
    });
  }
  async getBacktestList(userId: number) {
    return this.prisma.backtestJob.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        symbol: true,
        status: true,
        data_from: true,
        data_to: true,
        initial_capital: true,
        created_at: true,
      },
    });
  }

}
