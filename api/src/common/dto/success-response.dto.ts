export class SuccessResponseDto<T> {
  success: true;
  message?: string;
  data: T;
  timestamp: string;

  constructor(data: T, message?: string) {
    this.success = true;
    this.data = data;
    this.message = message;
    this.timestamp = new Date().toISOString();
  }
}
