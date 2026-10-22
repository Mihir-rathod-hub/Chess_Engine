/**
 * Standardized API Response Utilities for Strategic Chess Backend
 */

export function sendSuccess(reply, data, statusCode = 200) {
  return reply.status(statusCode).send({
    success: true,
    data
  });
}

export function sendError(reply, message, code = 'INTERNAL_SERVER_ERROR', statusCode = 500, details = null) {
  const errorPayload = {
    message,
    code
  };
  if (details) {
    errorPayload.details = details;
  }

  return reply.status(statusCode).send({
    success: false,
    error: errorPayload
  });
}
