import { HttpStatus } from '@nestjs/common';
import { AppError } from '../app-error.base';

export class NotFoundError extends AppError {
  constructor(message: string, detail?: any) {
    super(message, HttpStatus.NOT_FOUND, 'NOT FOUND', detail);
  }
}
