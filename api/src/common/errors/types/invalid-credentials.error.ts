import { HttpStatus } from '@nestjs/common';
import { AppError } from '../app-error.base';

export class InvalidCredential extends AppError {
  constructor(message: string, detail?: any) {
    super(message, HttpStatus.UNAUTHORIZED, 'INVALID_CREDENTIAL', detail);
  }
}
