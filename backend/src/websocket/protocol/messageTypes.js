/**
 * Strategic Chess WebSocket Protocol Message Types (Step 4 Extended)
 */

export const PROTOCOL_VERSION = 1;

export const MessageTypes = {
  // Client -> Server Connection Messages
  PING: 'connection.ping',
  AUTH: 'connection.auth',
  PRESENCE_INFO: 'presence.info',

  // Client -> Server Game Messages
  GAME_CREATE: 'game.create',
  GAME_JOIN: 'game.join',
  GAME_MOVE: 'game.move',
  GAME_RESIGN: 'game.resign',
  GAME_OFFER_DRAW: 'game.offer_draw',
  GAME_RESPOND_DRAW: 'game.respond_draw',
  GAME_LEAVE: 'game.leave',
  GAME_MATCHMAKE: 'game.matchmake',
  GAME_MATCHMAKE_CANCEL: 'game.matchmake_cancel',
  GAME_RECONNECT: 'game.reconnect',

  // Client -> Server Friend Room Messages
  FRIEND_CREATE: 'friend.create',
  FRIEND_JOIN: 'friend.join',
  FRIEND_START: 'friend.start',
  FRIEND_INFO: 'friend.info',
  FRIEND_LEAVE: 'friend.leave',

  // Server -> Client System Messages
  PONG: 'connection.pong',
  AUTHENTICATED: 'connection.authenticated',
  PRESENCE_DATA: 'presence.data',
  SYSTEM_ERROR: 'system.error',

  // Server -> Client Game Messages
  GAME_CREATED: 'game.created',
  GAME_JOINED: 'game.joined',
  GAME_QUEUED: 'game.queued',
  GAME_MATCHED: 'game.matched',
  GAME_MATCHMAKE_CANCELLED: 'game.matchmake_cancelled',
  GAME_RECONNECTED: 'game.reconnected',
  GAME_PLAYER_DISCONNECTED: 'game.player_disconnected',
  GAME_PLAYER_RECONNECTED: 'game.player_reconnected',
  GAME_STATE: 'game.state',
  GAME_MOVE_RESULT: 'game.move',
  GAME_CLOCK: 'game.clock',
  GAME_ENDED: 'game.ended',
  GAME_ERROR: 'game.error',

  // Server -> Client Friend Room Messages
  FRIEND_CREATED: 'friend.created',
  FRIEND_JOINED: 'friend.joined',
  FRIEND_PLAYER_JOINED: 'friend.player_joined',
  FRIEND_PLAYER_LEFT: 'friend.player_left',
  FRIEND_ROOM_CANCELLED: 'friend.room_cancelled',
  FRIEND_STARTED: 'friend.started'
};

export const ErrorCodes = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  INVALID_JSON: 'INVALID_JSON',
  UNKNOWN_MESSAGE_TYPE: 'UNKNOWN_MESSAGE_TYPE',
  MALFORMED_MESSAGE: 'MALFORMED_MESSAGE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  GAME_NOT_FOUND: 'GAME_NOT_FOUND',
  GAME_FULL: 'GAME_FULL',
  NOT_A_PLAYER: 'NOT_A_PLAYER',
  NOT_YOUR_TURN: 'NOT_YOUR_TURN',
  INVALID_MOVE: 'INVALID_MOVE',
  GAME_ALREADY_STARTED: 'GAME_ALREADY_STARTED',
  GAME_ALREADY_FINISHED: 'GAME_ALREADY_FINISHED',
  INVALID_GAME_STATE: 'INVALID_GAME_STATE',
  INVALID_GAME_REQUEST: 'INVALID_GAME_REQUEST',
  ALREADY_QUEUED: 'ALREADY_QUEUED',
  NOT_QUEUED: 'NOT_QUEUED',
  INVALID_MATCHMAKE_REQUEST: 'INVALID_MATCHMAKE_REQUEST',
  RECONNECT_FAILED: 'RECONNECT_FAILED',
  ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
  ROOM_EXPIRED: 'ROOM_EXPIRED',
  ROOM_FULL: 'ROOM_FULL',
  CANNOT_JOIN_OWN_ROOM: 'CANNOT_JOIN_OWN_ROOM',
  ROOM_CANNOT_BE_JOINED: 'ROOM_CANNOT_BE_JOINED',
  TOO_MANY_ATTEMPTS: 'TOO_MANY_ATTEMPTS'
};
