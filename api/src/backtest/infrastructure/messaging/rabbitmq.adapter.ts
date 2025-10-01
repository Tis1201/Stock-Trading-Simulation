import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import * as amqp from 'amqplib';
import { MessageBusPort } from '../../domain/ports/message-bus.port';

@Injectable()
export class RabbitMqAdapter implements MessageBusPort, OnModuleInit, OnModuleDestroy {
  private conn!: amqp.Connection;
  private ch!: amqp.Channel;
  private readonly EXCHANGE = 'backtest.exchange';
  private readonly ROUTING_KEY = 'backtest.requested';

  async onModuleInit() {
    this.conn = await amqp.connect(process.env.RABBITMQ_URL!);
    this.ch = await this.conn.createChannel();
    await this.ch.assertExchange(this.EXCHANGE, 'topic', { durable: true });

    // (Optional) nhận kết quả từ FastAPI (result queue)
    const resultQ = await this.ch.assertQueue('backtest.result', { durable: true });
    await this.ch.bindQueue(resultQ.queue, this.EXCHANGE, 'backtest.completed');

    this.ch.consume(resultQ.queue, async (msg) => {
      if (!msg) return;
      const payload = JSON.parse(msg.content.toString());
      // TODO: gọi Application service để update DB (COMPLETED/FAILED + trades)
      // Ví dụ: await this.handleResult(payload);
      this.ch.ack(msg);
    });
  }

  async publishBacktestRequested(payload: any): Promise<void> {
    const buf = Buffer.from(JSON.stringify(payload));
    this.ch.publish(this.EXCHANGE, this.ROUTING_KEY, buf, { persistent: true });
  }

  async onModuleDestroy() {
    await this.ch?.close();
    await this.conn?.close();
  }
}
