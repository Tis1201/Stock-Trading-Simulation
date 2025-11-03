import { HttpStatus } from '@nestjs/common';
import { AppError } from '../app-error.base';

export class YahooFinanceError extends AppError {
  constructor(
    message: string,
    detail?: any,
    status: number = HttpStatus.BAD_GATEWAY,
  ) {
    super(message, status, 'YAHOO_FINANCE_ERROR', detail);
  }

  static notFound(symbol: string) {
    return new YahooFinanceError(
      `Symbol ${symbol} not found on Yahoo Finance`,
      { symbol },
      HttpStatus.NOT_FOUND,
    );
  }

  static timeout(detail?: any) {
    return new YahooFinanceError(
      'Yahoo Finance request timed out',
      detail,
      HttpStatus.GATEWAY_TIMEOUT,
    );
  }

  static serviceUnavailable(detail?: any) {
    return new YahooFinanceError(
      'Yahoo Finance service unavailable',
      detail,
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}
