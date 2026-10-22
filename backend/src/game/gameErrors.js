/**
 * Strategic Chess Authoritative Game Error Codes
 */

export const GameErrorCodes = {
  GAME_NOT_FOUND: 'GAME_NOT_FOUND',
  GAME_FULL: 'GAME_FULL',
  NOT_A_PLAYER: 'NOT_A_PLAYER',
  NOT_YOUR_TURN: 'NOT_YOUR_TURN',
  INVALID_MOVE: 'INVALID_MOVE',
  GAME_ALREADY_STARTED: 'GAME_ALREADY_STARTED',
  GAME_ALREADY_FINISHED: 'GAME_ALREADY_FINISHED',
  INVALID_GAME_STATE: 'INVALID_GAME_STATE',
  INVALID_GAME_REQUEST: 'INVALID_GAME_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  RECONNECT_FAILED: 'RECONNECT_FAILED'
};

export class GameError extends Error {
  constructor(message, code = GameErrorCodes.INVALID_GAME_REQUEST, details = null) {
    super(message);
    this.name = 'GameError';
    this.code = code;
    this.details = details;
  }
}
