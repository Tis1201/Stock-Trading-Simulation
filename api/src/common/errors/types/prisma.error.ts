import { AppError } from '../app-error.base';
import { HttpStatus } from '@nestjs/common';

export class PrismaCustomError extends AppError {
  constructor(
    message: string,
    detail?: any,
    status: number = HttpStatus.INTERNAL_SERVER_ERROR,
  ) {
    super(message, status, 'PRISMA_ERROR', detail);
  }

  static uniqueConstraint(detail: any) {
    return new PrismaCustomError(
      'Unique Constraint Violation',
      detail,
      HttpStatus.CONFLICT,
    );
  }
}
