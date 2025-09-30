export abstract class AppError extends Error {
  public readonly isOperational: boolean = true;

  protected constructor(
    public message: string,
    public statusCode: number,
    public errorCode?: string,
    public detail?: any,
  ) {
    super(message);
    this.name = this.constructor.name;

    Object.setPrototypeOf(this, AppError.prototype);

    if (Error.captureStackTrace)
      Error.captureStackTrace(this, this.constructor);
  }
}
