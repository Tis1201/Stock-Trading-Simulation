import { Injectable } from '@nestjs/common';
import { OnModuleInit } from '@nestjs/common';
import * as amqp from 'amqplib';

@Injectable()
export class RabbitMQService implements OnModuleInit {
  private channel: amqp.Channel;

  async onModuleInit() {
    const connection = await amqp.connect({
      hostname: '127.0.0.1',
      port: 5672,
      username: 'guest',
      password: 'guest',
    });

    this.channel = await connection.createChannel();
    await this.channel.assertQueue('test');
    console.log('RabbitmqService onModuleInit');
  }

  async sendMessage(message: string) {
    await this.channel.sendToQueue('test', Buffer.from(message));
    console.log(` [NestJS] Sent: ${message}`);
  }

  consumeMessage() {
    this.channel.consume('test', (message) => {
      console.log(` [NestJS] Received: ${message.content.toString()}`);
      this.channel.ack(message);
      console.log(` [NestJS] Received: ${message.content.toString()}`);
    });
  }
}
