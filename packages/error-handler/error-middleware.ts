import { AppError } from './index';
import { Request, Response, NextFunction } from 'express';

export const errorMiddleware = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (err instanceof AppError) {
    console.log(`Error: ${req.method} ${req.url} - ${err.message}`);
    return res.status(err.statusCode).json({
      status: 'error',
      message: err.message,
      ...(err.details && { details: err.details }),
    });
  }
  console.error('Unahandled Error:', err);
  return res.status(500).json({
    status: false,
    message: 'Internal server error',
    details: err.message || 'An unexpected error occurred',
  });
};
