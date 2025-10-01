import { Module } from '@nestjs/common';

import { PrismaClient } from '@prisma/client';
import { BacktestController } from '../infrastructure/controllers/backtest.controller';
import { CreateBacktestUseCase } from '../application/use-case/create-backtest.usecase';
import { PrismaBacktestRepository } from '../infrastructure/persistence/prisma-backtest.repository';
import { RabbitMqAdapter } from '../infrastructure/messaging/rabbitmq.adapter';

@Module({
  controllers: [BacktestController],
  providers: [
    CreateBacktestUseCase,
    PrismaBacktestRepository,
    RabbitMqAdapter,
    PrismaClient,
    {
      provide: 'BacktestRepository',
      useClass: PrismaBacktestRepository,
    },
    {
      provide: 'MessageBusPort',
      useClass: RabbitMqAdapter,
    },
  ],
  exports: [],
})
export class BacktestModule {}
