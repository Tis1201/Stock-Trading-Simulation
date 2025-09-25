import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AppError } from '../errors';

interface ErrorInfo {
  status: number;
  message: string;
  errorCode: string;
  detail?: any;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const errorInfo = this.extractErrorInfo(exception);

    this.logError(exception, request, errorInfo.status);

    this.sendErrorResponse(response, request, errorInfo, exception);
  }

  private extractErrorInfo(exception: unknown): ErrorInfo {
    if (exception instanceof AppError) {
      return {
        status: exception.statusCode,
        message: exception.message,
        errorCode: exception.errorCode || 'UNKNOWN_ERROR',
        detail: exception.detail,
      };
    }

    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      return {
        status: exception.getStatus(),
        errorCode: 'HTTP_EXCEPTION',
        message: this.getHttpExceptionMessage(response),
        detail: null,
      };
    }

    if (exception instanceof Error) {
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        errorCode: 'UNKNOWN_ERROR',
        message: 'Internal Server Error',
        detail: exception.message,
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      errorCode: 'UNKNOWN_ERROR',
      message: 'Internal Server Error',
      detail: null,
    };
  }

  private getHttpExceptionMessage(response: string | object): string {
    if (typeof response === 'string') {
      return response;
    }

    if (typeof response === 'object' && response !== null) {
      return (response as any).message || 'HTTP Exception';
    }

    return 'HTTP Exception';
  }

  private sendErrorResponse(
    response: Response,
    request: Request,
    errorInfo: ErrorInfo,
    exception: unknown,
  ) {
    const errorResponse = {
      success: false,
      error: {
        message: errorInfo.message,
        code: errorInfo.errorCode,
        timestamp: new Date().toISOString(),
        path: request.url,
        method: request.method,
        ...(errorInfo.detail && { detail: errorInfo.detail }),
        ...(this.shouldShowStack(errorInfo.status) && {
          stack: (exception as Error)?.stack,
        }),
      },
    };

    response.status(errorInfo.status).json(errorResponse);
  }

  private logError(exception: unknown, request: Request, status: number) {
    const logData = {
      path: request.url,
      method: request.method,
      userAgent: request.headers['user-agent'],
      ip: request.ip,
      status,
    };

    const isOperationalError = this.isOperationalError(exception, status);

    if (isOperationalError) {
      this.logger.warn(
        `Operational error: ${(exception as Error)?.message || 'Unknown error'}`,
        logData,
      );
    } else {
      this.logger.error(
        `System error: ${(exception as Error)?.message || 'Unknown error'}`,
        {
          ...logData,
          stack: (exception as Error)?.stack,
        },
      );
    }
  }

  private isOperationalError(exception: unknown, status: number): boolean {
    return (
      (exception instanceof AppError && exception.isOperational) ||
      (exception instanceof HttpException &&
        status < HttpStatus.INTERNAL_SERVER_ERROR)
    );
  }

  private shouldShowStack(status: number): boolean {
    return (
      process.env.NODE_ENV === 'development' &&
      status >= HttpStatus.INTERNAL_SERVER_ERROR
    );
  }
}
