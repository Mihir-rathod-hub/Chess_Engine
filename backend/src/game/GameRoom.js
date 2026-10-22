import { Chess } from 'chess.js';
import { GameClock } from './GameClock.js';
import { GameError, GameErrorCodes } from './gameErrors.js';

export class GameRoom {
  constructor({ id, whitePlayerId = null, blackPlayerId = null, whitePlayerRating = null, blackPlayerRating = null, timeControl = '10min', gameType = 'casual', onTimeoutHandler = null, disconnectGraceSeconds = 45 }) {
    this.id = id;
    this.whitePlayerId = whitePlayerId;
    this.blackPlayerId = blackPlayerId;
    this.whitePlayerRating = typeof whitePlayerRating === 'number' ? whitePlayerRating : null;
    this.blackPlayerRating = typeof blackPlayerRating === 'number' ? blackPlayerRating : null;
    this.timeControl = timeControl;
    this.gameType = gameType;

    this.chess = new Chess();
    this.status = 'pending'; // 'pending', 'in_progress', 'completed', 'aborted', 'draw'
    this.result = null; // 'white_win', 'black_win', 'draw', 'stalemate', 'resign', 'timeout', 'aborted'
    this.winnerId = null;
    this.resultReason = null;
    this.drawOfferFrom = null;

    this.moveHistory = [];
    this.createdTimestamp = Date.now();
    this.startedTimestamp = null;
    this.completedTimestamp = null;

    // Server-Authoritative Elo Rating Tracking
    this.ratingsApplied = false;
    this.ratingChanges = null;
    this.dbPersisted = false;
    this.dbPersistenceError = null;

    // Disconnection & Reconnection Grace Period Configuration
    this.disconnectGraceSeconds = disconnectGraceSeconds;
    this.disconnectedPlayerId = null;
    this.disconnectGraceExpiresAt = null;
    this.disconnectTimer = null;
    this.isGraceActive = false;

    // Server-Authoritative Clock
    this.clock = new GameClock(timeControl, (loserColor) => {
      if (typeof onTimeoutHandler === 'function') {
        onTimeoutHandler(this.id, loserColor);
      }
    });
  }

  addPlayer(userId) {
    if (this.whitePlayerId === userId || this.blackPlayerId === userId) {
      return this.getPlayerColor(userId);
    }

    if (!this.whitePlayerId) {
      this.whitePlayerId = userId;
      return 'w';
    } else if (!this.blackPlayerId) {
      this.blackPlayerId = userId;
      return 'b';
    } else {
      throw new GameError('Game room is already full.', GameErrorCodes.GAME_FULL);
    }
  }

  getPlayerColor(userId) {
    if (userId === this.whitePlayerId) return 'w';
    if (userId === this.blackPlayerId) return 'b';
    return null;
  }

  start() {
    if (!this.whitePlayerId || !this.blackPlayerId) {
      throw new GameError('Cannot start game without two players.', GameErrorCodes.INVALID_GAME_STATE);
    }
    if (this.status !== 'pending') {
      throw new GameError('Game is already started or finished.', GameErrorCodes.GAME_ALREADY_STARTED);
    }

    this.status = 'in_progress';
    this.startedTimestamp = Date.now();
    this.clock.start('w');
    return this.getState();
  }

  makeMove(playerId, moveRequest) {
    if (this.status !== 'in_progress') {
      throw new GameError('Game is not in progress.', GameErrorCodes.GAME_ALREADY_FINISHED);
    }

    const playerColor = this.getPlayerColor(playerId);
    if (!playerColor) {
      throw new GameError('You are not a player in this game.', GameErrorCodes.NOT_A_PLAYER);
    }

    const currentTurn = this.chess.turn(); // 'w' or 'b'
    if (playerColor !== currentTurn) {
      throw new GameError("It is not your turn to move.", GameErrorCodes.NOT_YOUR_TURN);
    }

    if (!moveRequest || typeof moveRequest !== 'object' || !moveRequest.from || !moveRequest.to) {
      throw new GameError('Move must specify from and to squares.', GameErrorCodes.INVALID_MOVE);
    }

    // Validate and apply move using server-side chess.js instance
    let moveResult = null;
    try {
      moveResult = this.chess.move({
        from: moveRequest.from,
        to: moveRequest.to,
        promotion: moveRequest.promotion || 'q'
      });
    } catch (err) {
      throw new GameError(`Illegal move: ${err.message}`, GameErrorCodes.INVALID_MOVE);
    }

    if (!moveResult) {
      throw new GameError(`Illegal move from ${moveRequest.from} to ${moveRequest.to}`, GameErrorCodes.INVALID_MOVE);
    }

    // Clear active draw offers upon move
    this.drawOfferFrom = null;

    // Switch clock turn and calculate elapsed time
    const nextTurn = this.chess.turn();
    const timeSpentMs = this.clock.switchTurn(nextTurn);

    // Record authoritative move detail
    const moveNumber = this.chess.history().length;
    const moveLog = {
      moveNumber,
      playerId,
      playerColor,
      san: moveResult.san,
      lan: `${moveResult.from}${moveResult.to}${moveResult.promotion || ''}`,
      fenAfter: this.chess.fen(),
      timeSpentMs
    };
    this.moveHistory.push(moveLog);

    // If player making move was marked as disconnected, cancel grace period
    if (this.disconnectedPlayerId === playerId) {
      this.cancelDisconnectGrace(playerId);
    }

    // Check game termination conditions
    if (this.chess.isCheckmate()) {
      this.cancelDisconnectGrace(this.disconnectedPlayerId);
      this.status = 'completed';
      this.result = playerColor === 'w' ? 'white_win' : 'black_win';
      this.winnerId = playerId;
      this.resultReason = 'Checkmate';
      this.completedTimestamp = Date.now();
      this.clock.pause();
    } else if (this.chess.isStalemate()) {
      this.cancelDisconnectGrace(this.disconnectedPlayerId);
      this.status = 'completed';
      this.result = 'stalemate';
      this.winnerId = null;
      this.resultReason = 'Stalemate';
      this.completedTimestamp = Date.now();
      this.clock.pause();
    } else if (this.chess.isDraw()) {
      this.cancelDisconnectGrace(this.disconnectedPlayerId);
      this.status = 'completed';
      this.result = 'draw';
      this.winnerId = null;
      this.resultReason = this.chess.isThreefoldRepetition()
        ? 'Threefold Repetition'
        : this.chess.isInsufficientMaterial()
        ? 'Insufficient Material'
        : '50-Move Rule Draw';
      this.completedTimestamp = Date.now();
      this.clock.pause();
    }

    return {
      move: moveLog,
      state: this.getState()
    };
  }

  startDisconnectGrace(playerId, onGraceExpired = null) {
    if (this.status !== 'in_progress') return null;

    const playerColor = this.getPlayerColor(playerId);
    if (!playerColor) return null;

    // Idempotent: If grace is already running for this player, do not restart timer
    if (this.isGraceActive && this.disconnectedPlayerId === playerId) {
      return {
        disconnectedPlayerId: this.disconnectedPlayerId,
        disconnectGraceExpiresAt: this.disconnectGraceExpiresAt,
        disconnectGraceSeconds: this.disconnectGraceSeconds
      };
    }

    if (this.disconnectTimer) {
      clearTimeout(this.disconnectTimer);
      this.disconnectTimer = null;
    }

    this.disconnectedPlayerId = playerId;
    this.disconnectGraceExpiresAt = Date.now() + (this.disconnectGraceSeconds * 1000);
    this.isGraceActive = true;

    this.disconnectTimer = setTimeout(() => {
      if (typeof onGraceExpired === 'function') {
        try {
          onGraceExpired();
        } catch (e) {
          console.error('Error in onGraceExpired callback:', e);
        }
      } else {
        this.handleDisconnectForfeit(playerId);
      }
    }, this.disconnectGraceSeconds * 1000);

    return {
      disconnectedPlayerId: this.disconnectedPlayerId,
      disconnectGraceExpiresAt: this.disconnectGraceExpiresAt,
      disconnectGraceSeconds: this.disconnectGraceSeconds
    };
  }

  cancelDisconnectGrace(playerId) {
    if (this.isGraceActive && (!playerId || this.disconnectedPlayerId === playerId)) {
      if (this.disconnectTimer) {
        clearTimeout(this.disconnectTimer);
        this.disconnectTimer = null;
      }
      this.disconnectedPlayerId = null;
      this.disconnectGraceExpiresAt = null;
      this.isGraceActive = false;
      return true;
    }
    return false;
  }

  handleDisconnectForfeit(playerId) {
    if (this.status !== 'in_progress') return null;

    if (this.disconnectTimer) {
      clearTimeout(this.disconnectTimer);
      this.disconnectTimer = null;
    }
    this.isGraceActive = false;
    this.disconnectedPlayerId = null;
    this.disconnectGraceExpiresAt = null;

    const playerColor = this.getPlayerColor(playerId);
    if (!playerColor) return null;

    this.status = 'completed';
    this.result = playerColor === 'w' ? 'black_win' : 'white_win';
    this.winnerId = playerColor === 'w' ? this.blackPlayerId : this.whitePlayerId;
    this.resultReason = 'Opponent disconnected (Abandonment)';
    this.completedTimestamp = Date.now();
    this.clock.pause();

    return this.getState();
  }

  handleDisconnect(playerId) {
    return this.handleDisconnectForfeit(playerId);
  }

  resign(playerId) {
    if (this.status !== 'in_progress') {
      throw new GameError('Game is not in progress.', GameErrorCodes.GAME_ALREADY_FINISHED);
    }

    const playerColor = this.getPlayerColor(playerId);
    if (!playerColor) {
      throw new GameError('You are not a player in this game.', GameErrorCodes.NOT_A_PLAYER);
    }

    this.cancelDisconnectGrace(this.disconnectedPlayerId);

    this.status = 'completed';
    this.result = playerColor === 'w' ? 'black_win' : 'white_win';
    this.winnerId = playerColor === 'w' ? this.blackPlayerId : this.whitePlayerId;
    this.resultReason = 'Resignation';
    this.completedTimestamp = Date.now();
    this.clock.pause();

    return this.getState();
  }

  handleTimeout(loserColor) {
    if (this.status !== 'in_progress') return;

    this.cancelDisconnectGrace(this.disconnectedPlayerId);

    this.status = 'completed';
    this.result = loserColor === 'w' ? 'black_win' : 'white_win';
    this.winnerId = loserColor === 'w' ? this.blackPlayerId : this.whitePlayerId;
    this.resultReason = 'Timeout';
    this.completedTimestamp = Date.now();

    return this.getState();
  }

  offerDraw(playerId) {
    if (this.status !== 'in_progress') {
      throw new GameError('Game is not in progress.', GameErrorCodes.GAME_ALREADY_FINISHED);
    }
    const playerColor = this.getPlayerColor(playerId);
    if (!playerColor) {
      throw new GameError('You are not a player in this game.', GameErrorCodes.NOT_A_PLAYER);
    }

    this.drawOfferFrom = playerId;
    return { drawOfferFrom: playerId };
  }

  respondDraw(playerId, accept) {
    if (this.status !== 'in_progress') {
      throw new GameError('Game is not in progress.', GameErrorCodes.GAME_ALREADY_FINISHED);
    }
    const playerColor = this.getPlayerColor(playerId);
    if (!playerColor) {
      throw new GameError('You are not a player in this game.', GameErrorCodes.NOT_A_PLAYER);
    }
    if (!this.drawOfferFrom || this.drawOfferFrom === playerId) {
      throw new GameError('No active draw offer from opponent.', GameErrorCodes.INVALID_GAME_REQUEST);
    }

    if (accept) {
      this.cancelDisconnectGrace(this.disconnectedPlayerId);
      this.status = 'completed';
      this.result = 'draw';
      this.winnerId = null;
      this.resultReason = 'Mutual Agreement Draw';
      this.completedTimestamp = Date.now();
      this.clock.pause();
    }

    this.drawOfferFrom = null;
    return this.getState();
  }

  getState() {
    const clockTimes = this.clock.getTimeLeft();
    const lastMove = this.moveHistory.length > 0 ? this.moveHistory[this.moveHistory.length - 1] : null;

    return {
      gameId: this.id,
      whitePlayerId: this.whitePlayerId,
      blackPlayerId: this.blackPlayerId,
      gameType: this.gameType,
      timeControl: this.timeControl,
      fen: this.chess.fen(),
      pgn: this.chess.pgn(),
      turn: this.chess.turn(),
      isCheck: this.chess.inCheck(),
      status: this.status,
      result: this.result,
      winnerId: this.winnerId,
      resultReason: this.resultReason,
      ratingsApplied: this.ratingsApplied,
      ratingChanges: this.ratingChanges,
      dbPersisted: this.dbPersisted,
      dbPersistenceError: this.dbPersistenceError,
      drawOfferFrom: this.drawOfferFrom,
      lastMove,
      clocks: {
        whiteTimeLeft: clockTimes.whiteTimeLeft,
        blackTimeLeft: clockTimes.blackTimeLeft,
        activeColor: clockTimes.activeColor
      },
      disconnectedPlayerId: this.disconnectedPlayerId,
      disconnectGraceExpiresAt: this.disconnectGraceExpiresAt,
      isGraceActive: this.isGraceActive,
      moveHistory: this.moveHistory,
      moveCount: this.moveHistory.length
    };
  }
}
