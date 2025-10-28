export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly details?: any;

  constructor(
    message: string,
    statusCode: number,
    isOperational = true,
    details?: any
  ) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.details = details;
    Error.captureStackTrace(this);
  }
}

//Not Found Error
export class NotFoundError extends AppError {
  constructor(message = 'Resources not found', details?: any) {
    super(message, 404, true, details);
  }
}

//validation Error(use for Joi/zod/react-hook-form validation errors)
export class ValidationError extends AppError {
  constructor(message = 'Invalid request data', details?: any) {
    super(message, 400, true, details);
  }
}

//Authencation Error
export class AuthenticationError extends AppError {
  constructor(message = 'Unauthorized', details?: any) {
    super(message, 401, true, details);
  }
}

// Forbidden Error
export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden', details?: any) {
    super(message, 403, true, details);
  }
}

//Database Error
export class DatabaseError extends AppError {
  constructor(message = 'Database error', details?: any) {
    super(message, 500, false, details);
  }
}

//Rate Limit Error(If user exceeds API Limits)
export class RateLimitError extends AppError {
  constructor(message = 'Too many requests, please try again later') {
    super(message, 429);
  }
}
