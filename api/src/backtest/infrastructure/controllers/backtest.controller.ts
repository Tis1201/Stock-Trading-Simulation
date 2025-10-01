import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { CreateBacktestDto } from 'src/backtest/domain/dto/create-backtest.dto';
import { CreateBacktestUseCase } from 'src/backtest/domain/use-case/create-backtest.usecase';
import { Public } from 'src/custom-decorator';

@Controller('api/backtests')
export class BacktestController {
  constructor(private readonly service: CreateBacktestUseCase) {}

  @Public()
  @Post()
  async create(@Req() req: Request, @Body() dto: CreateBacktestDto) {
    const userId = (req as any).user?.id ?? 1; // TODO: lấy từ JWT
    return this.service.createBacktestJob(userId, dto);
  }

  @Get(':jobId')
  async get(@Param('jobId') jobId: string) {
    return this.service.getBacktestResult(Number(jobId));
  }
}
