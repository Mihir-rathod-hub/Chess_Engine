import { PROTOCOL_VERSION, MessageTypes } from './messageTypes.js';

/**
 * Format a structured successful WebSocket protocol message frame
 */
export function formatResponse(type, payload = {}, requestId = null) {
  const message = {
    type,
    version: PROTOCOL_VERSION,
    payload
  };

  if (requestId) {
    message.requestId = requestId;
  }

  return message;
}

/**
 * Format a structured WebSocket error message frame
 */
export function formatError(messageStr, code = 'INTERNAL_ERROR', requestId = null, details = null) {
  const errorObj = {
    message: messageStr,
    code
  };

  if (details) {
    errorObj.details = details;
  }

  const response = {
    type: MessageTypes.SYSTEM_ERROR,
    version: PROTOCOL_VERSION,
    error: errorObj
  };

  if (requestId) {
    response.requestId = requestId;
  }

  return response;
}
