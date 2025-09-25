import { Module } from '@nestjs/common';
import { MetricService } from './metric.service';
import { MetricController } from './metric.controller';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { MetricInterceptor } from 'src/common/interceptors/metric.interceptor';

@Module({
  imports: [PrometheusModule.register()],
  controllers: [MetricController],
  providers: [
    MetricService,
    {
      provide: APP_INTERCEPTOR,
      useClass: MetricInterceptor,
    },
  ],
  exports: [MetricService],
})
export class MetricModule {}
