import { config } from '../config/index.js';

export function notFound(req, res) {
  res.status(404).json({ error: { message: `Route not found: ${req.method} ${req.originalUrl}` } });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, next) {
  // Response already started (e.g. an SSE stream) → let Express close it.
  if (res.headersSent) return next(err);

  let status = err.status ?? err.statusCode ?? 500;
  let message = err.message || 'Internal server error';

  // Duplicate key (e.g. email already registered)
  if (err.code === 11000) {
    status = 409;
    message = 'An account with this email already exists';
  }
  // Malformed JSON body
  if (err.type === 'entity.parse.failed') {
    status = 400;
    message = 'Malformed JSON body';
  }

  if (status >= 500) {
    console.error(err);
    // Don't leak internals in production.
    if (config.isProd) message = 'Internal server error';
  }

  res.status(status).json({
    error: {
      message,
      ...(err.details && { details: err.details }),
      ...(!config.isProd && status >= 500 && { stack: err.stack }),
    },
  });
}
