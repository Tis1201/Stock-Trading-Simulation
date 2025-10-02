import { BusinessLogicError } from './types/business-logic.error';
import { InvalidCredential } from './types/invalid-credentials.error';
import { NotFoundError } from './types/not-found.error';
import { YahooFinanceError } from './types/yahoo-finance2.error';

export class ErrorFactory {
  static NotFoundError(message: string, detail?: any): NotFoundError {
    return new NotFoundError(message, detail);
  }

  static BusinessLogicError(message: string, detail?: any): BusinessLogicError {
    return new BusinessLogicError(message, detail);
  }

  static InvalidCredentialsError(
    message: string,
    detail?: any,
  ): InvalidCredential {
    return new InvalidCredential(message, detail);
  }

  static YahooFinanceNotFound(symbol: string): YahooFinanceError {
    return YahooFinanceError.notFound(symbol);
  }

  static YahooFinanceTimeout(detail?: any): YahooFinanceError {
    return YahooFinanceError.timeout(detail);
  }

  static YahooFinanceServiceUnavailable(detail?: any): YahooFinanceError {
    return YahooFinanceError.serviceUnavailable(detail);
  }
}
