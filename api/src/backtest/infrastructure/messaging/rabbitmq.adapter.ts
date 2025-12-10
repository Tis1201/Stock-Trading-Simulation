import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import * as amqp from 'amqplib';
import { MessageBusPort } from '../../domain/ports/message-bus.port';
import * as backtestRepository from '../../domain/ports/backtest.repository';

interface BacktestResultPayload {
  job_id: number;
  status: 'COMPLETED' | 'FAILED';
  netProfit: number;
  winRate: number;
  maxDrawdown: number;
  profitFactor: number;
  totalTrades: number;
  equityCurve: Array<{ time: number; value: number }>;
  underwater: Array<{ time: number; value: number }>;
  trades: Array<{
    entryTime: number;
    exitTime: number;
    entryPrice: number;
    exitPrice: number;
    quantity: number;
    profit: number;
    side: 'buy' | 'sell';
  }>;
}

@Injectable()
export class RabbitMqAdapter
  implements MessageBusPort, OnModuleInit, OnModuleDestroy
{
  private conn?: amqp.Connection;
  private ch?: amqp.Channel;

  // Exchange & routing keys phải trùng với FastAPI
  private readonly EXCHANGE = 'backtest.exchange';
  private readonly REQUEST_ROUTING_KEY = 'backtest.requested';
  private readonly RESULT_ROUTING_KEY = 'backtest.completed';

  // Queue nhận result từ FastAPI
  private readonly RESULT_QUEUE = 'backtest.result';

  constructor(
    @Inject('BacktestRepository')
    private readonly backtestRepo: backtestRepository.BacktestRepository,
  ) {}

  // ==========================
  // Khởi tạo RabbitMQ
  // ==========================
  async onModuleInit() {
    const url = process.env.RABBITMQ_URL;
    if (!url) {
      console.error(
        '[Nest] ❌ RABBITMQ_URL is not defined in environment variables',
      );
      return;
    }

    console.log('[Nest] Connecting RabbitMQ at', url);
    this.conn = await amqp.connect(url);
    this.ch = await this.conn.createChannel();

    // Exchange topic dùng chung với FastAPI
    await this.ch.assertExchange(this.EXCHANGE, 'topic', { durable: true });

    // Queue nhận kết quả backtest từ FastAPI
    const resultQ = await this.ch.assertQueue(this.RESULT_QUEUE, {
      durable: true,
    });

    // Bind queue với exchange & routing key result
    await this.ch.bindQueue(
      resultQ.queue,
      this.EXCHANGE,
      this.RESULT_ROUTING_KEY,
    );

    console.log(
      `[Nest] ✅ Bound queue '${resultQ.queue}' to exchange '${this.EXCHANGE}' with routing key '${this.RESULT_ROUTING_KEY}'`,
    );

    // Bắt đầu consume kết quả
    this.ch.consume(
      resultQ.queue,
      async (msg) => {
        if (!msg) return;

        try {
          const json = msg.content.toString();
          const payload = JSON.parse(json) as BacktestResultPayload;

          console.log('[Nest] 🔔 Received backtest.result:', payload);

          // 1. Lấy job hiện tại từ DB (bao gồm job_config cũ)
          const job: any = await this.backtestRepo.getJobWithTrades(
            payload.job_id,
          );
          const oldConfig = job.job_config || {};

          // 2. Đếm số lệnh có lợi nhuận
          const profitableTrades =
            payload.trades?.filter((t) => t.profit > 0).length ?? 0;

          // 3. Build result chuẩn FE cần
          const resultForUi = {
            jobId: payload.job_id,
            symbol: job.symbol,
            status: payload.status,
            dataFrom: job.data_from,
            dataTo: job.data_to,
            initialCapital: Number(job.initial_capital),

            netProfit: payload.netProfit,
            winRate: payload.winRate,
            maxDrawdown: payload.maxDrawdown,
            profitFactor: payload.profitFactor,
            totalTrades: payload.totalTrades,
            profitableTrades,

            equityCurve: payload.equityCurve ?? [],
            underwater: payload.underwater ?? [],
            trades: payload.trades ?? [],
          };

          // 4. Merge vào job_config.result (không phá các config khác)
          const newConfig = {
            ...oldConfig,
            result: resultForUi,
          };

          // 5. Update job trong DB
          await this.backtestRepo.updateJobStatus(payload.job_id, {
            status: payload.status,
            total_trades: payload.totalTrades,
            win_rate: payload.winRate,
            max_drawdown: payload.maxDrawdown,
            profitable_trades: profitableTrades,
            job_config: newConfig,
          });

          console.log(
            `[Nest] ✅ Updated BacktestJob#${payload.job_id} with result from FastAPI`,
          );

          this.ch!.ack(msg);
        } catch (err) {
          console.error('[Nest] ❌ Error handling backtest.result:', err);
          // Không requeue để tránh loop vô hạn
          this.ch!.nack(msg, false, false);
        }
      },
      { noAck: false },
    );

    console.log(
      `[Nest] ▶ Consuming backtest results from queue '${this.RESULT_QUEUE}'`,
    );
  }

  // ==========================
  // Gửi job sang FastAPI
  // ==========================
  async publishBacktestRequested(payload: any): Promise<void> {
    if (!this.ch) {
      throw new Error(
        'RabbitMQ channel is not initialized. Did onModuleInit run?',
      );
    }

    const buf = Buffer.from(JSON.stringify(payload));

    this.ch.publish(this.EXCHANGE, this.REQUEST_ROUTING_KEY, buf, {
      persistent: true,
    });

    console.log(
      `[Nest] 📤 Published backtest.requested for job ${payload.job_id} to exchange '${this.EXCHANGE}' with routing key '${this.REQUEST_ROUTING_KEY}'`,
    );
  }

  // ==========================
  // Cleanup
  // ==========================
  async onModuleDestroy() {
    try {
      await this.ch?.close();
      await this.conn?.close();
      console.log('[Nest] RabbitMQ connection closed');
    } catch (e) {
      console.error('[Nest] Error closing RabbitMQ connection', e);
    }
  }
}
