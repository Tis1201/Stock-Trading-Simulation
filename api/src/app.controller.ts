import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { RabbitMQService } from './rabbitmq/rabbitmq.service';
import { Public } from './custom-decorator';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly rabbitmq: RabbitMQService,
  ) {}

  @Public()
  @Get('send')
  async send() {
    await this.rabbitmq.sendMessage('Hello from NestJS!');
    return { message: 'Message sent to RabbitMQ' };
  }
}
