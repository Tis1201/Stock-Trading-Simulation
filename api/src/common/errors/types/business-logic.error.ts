import { HttpStatus } from '@nestjs/common';
import { AppError } from '../app-error.base';

export class BusinessLogicError extends AppError {
  constructor(message: string, detail?: any) {
    super(
      message,
      HttpStatus.UNPROCESSABLE_ENTITY,
      'BUSINESS_LOGIC_ERROR',
      detail,
    );
  }
}
