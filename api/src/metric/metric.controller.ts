import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { MetricService } from './metric.service';

@Controller('metrics')
export class MetricController {
  constructor(private readonly metricService: MetricService) {}

  @Get()
  async getMetrics(@Res() res: Response) {
    res.setHeader('Content-Type', this.metricService.getContentType());
    res.send(await this.metricService.getRegistry().metrics());
  }
}
