import type { ErrorRequestHandler, RequestHandler } from 'express';
import { config } from '../config';
import { AppError, translateDbError } from '../utils/errors';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new AppError(404, 'NOT_FOUND', `No route for ${req.method} ${req.path}.`));
};

/** Single place where every failure becomes a consistent JSON body: { error: { code, message, details? } }. */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  let appError: AppError | null = null;

  if (err instanceof AppError) appError = err;
  else if (err?.type === 'entity.parse.failed') appError = new AppError(400, 'BAD_JSON', 'The request body is not valid JSON.');
  else if (err?.type === 'entity.too.large') appError = new AppError(413, 'TOO_LARGE', 'The request body is too large.');
  else appError = translateDbError(err);

  if (!appError) {
    if (!config.isTest) console.error(`[error] ${req.method} ${req.originalUrl}`, err);
    appError = new AppError(500, 'INTERNAL', 'Something went wrong on the server. Try again, and tell the team if it keeps happening.');
  }

  res.status(appError.status).json({
    error: { code: appError.code, message: appError.message, ...(appError.details ? { details: appError.details } : {}) },
  });
};
