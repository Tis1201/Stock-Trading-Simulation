import { BusinessLogicError } from './types/business-logic.error';
import { NotFoundError } from './types/not-found.error';

export class ErrorFactory {
  static NotFoundError(message: string, detail?: any): NotFoundError {
    return new NotFoundError(message, detail);
  }

  static BusinessLogicError(message: string, detail?: any): BusinessLogicError {
    return new BusinessLogicError(message, detail);
  }
}
