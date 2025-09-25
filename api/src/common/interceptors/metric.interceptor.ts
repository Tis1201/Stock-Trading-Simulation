import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { MetricService } from 'src/metric/metric.service';

@Injectable()
export class MetricInterceptor implements NestInterceptor {
  constructor(private readonly metricService: MetricService) {}
  intercept(
    context: ExecutionContext,
    next: CallHandler<any>,
  ): Observable<any> | Promise<Observable<any>> {
    const req = context.switchToHttp().getRequest();
    const method = req.method;
    const route = req.route?.path ?? req.url;
    const start = process.hrtime();

    return next.handle().pipe(
      tap(() => {
        const status = context.switchToHttp().getResponse().statusCode;
        this.metricService.increment(method, route, status);

        const diff = process.hrtime(start);
        const duration = diff[0] * 1e3 + diff[1] / 1e6;
        this.metricService.observeDuration(method, route, status, duration);
      }),
    );
  }
}
