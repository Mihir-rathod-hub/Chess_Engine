/**
 * Strategic Chess Server-Authoritative Game Clock Module
 * Calculates elapsed time strictly using server Date.now() timestamps.
 */

export class GameClock {
  constructor(timeControl = '10min', onTimeoutCallback = null) {
    this.timeControl = timeControl;
    this.onTimeoutCallback = onTimeoutCallback;

    // Convert time control string or number to seconds
    this.initialSeconds = this.parseTimeControl(timeControl);
    this.whiteTimeLeft = this.initialSeconds;
    this.blackTimeLeft = this.initialSeconds;

    this.activeColor = null; // 'w' or 'b'
    this.lastMoveTimestamp = null;
    this.timer = null;
    this.isRunning = false;
  }

  parseTimeControl(tc) {
    if (typeof tc === 'number') return tc;
    if (typeof tc === 'string') {
      const lower = tc.toLowerCase().trim();
      if (lower.endsWith('min')) {
        const mins = parseInt(lower.replace('min', ''), 10);
        if (!isNaN(mins) && mins > 0) return mins * 60;
      }
      if (lower.endsWith('sec') || lower.endsWith('s')) {
        const secs = parseInt(lower.replace(/(sec|s)/, ''), 10);
        if (!isNaN(secs) && secs > 0) return secs;
      }
    }
    return 600; // Default 10 minutes (600 seconds)
  }

  start(initialColor = 'w') {
    this.activeColor = initialColor;
    this.lastMoveTimestamp = Date.now();
    this.isRunning = true;
    this.resetTimer();
  }

  resetTimer() {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    if (!this.isRunning || !this.activeColor) return;

    const currentLeftSeconds = this.activeColor === 'w' ? this.whiteTimeLeft : this.blackTimeLeft;
    const timeoutMs = Math.max(1, currentLeftSeconds * 1000);

    this.timer = setTimeout(() => {
      this.handleTimeout();
    }, timeoutMs);
  }

  handleTimeout() {
    this.isRunning = false;
    if (this.activeColor === 'w') {
      this.whiteTimeLeft = 0;
    } else {
      this.blackTimeLeft = 0;
    }
    const loserColor = this.activeColor;
    if (typeof this.onTimeoutCallback === 'function') {
      this.onTimeoutCallback(loserColor);
    }
  }

  switchTurn(newActiveColor) {
    if (!this.isRunning || !this.lastMoveTimestamp) {
      this.start(newActiveColor);
      return 0;
    }

    const now = Date.now();
    const elapsedMs = now - this.lastMoveTimestamp;
    const elapsedSecs = Math.floor(elapsedMs / 1000);

    if (this.activeColor === 'w') {
      this.whiteTimeLeft = Math.max(0, this.whiteTimeLeft - elapsedSecs);
    } else if (this.activeColor === 'b') {
      this.blackTimeLeft = Math.max(0, this.blackTimeLeft - elapsedSecs);
    }

    this.activeColor = newActiveColor;
    this.lastMoveTimestamp = now;

    if (this.whiteTimeLeft <= 0 || this.blackTimeLeft <= 0) {
      this.handleTimeout();
      return elapsedMs;
    }

    this.resetTimer();
    return elapsedMs;
  }

  pause() {
    this.isRunning = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.lastMoveTimestamp && this.activeColor) {
      const now = Date.now();
      const elapsedSecs = Math.floor((now - this.lastMoveTimestamp) / 1000);
      if (this.activeColor === 'w') {
        this.whiteTimeLeft = Math.max(0, this.whiteTimeLeft - elapsedSecs);
      } else {
        this.blackTimeLeft = Math.max(0, this.blackTimeLeft - elapsedSecs);
      }
    }
  }

  getTimeLeft() {
    // If currently running, calculate live remaining seconds
    let currentWhite = this.whiteTimeLeft;
    let currentBlack = this.blackTimeLeft;

    if (this.isRunning && this.lastMoveTimestamp && this.activeColor) {
      const elapsedSecs = Math.floor((Date.now() - this.lastMoveTimestamp) / 1000);
      if (this.activeColor === 'w') {
        currentWhite = Math.max(0, this.whiteTimeLeft - elapsedSecs);
      } else {
        currentBlack = Math.max(0, this.blackTimeLeft - elapsedSecs);
      }
    }

    return {
      whiteTimeLeft: currentWhite,
      blackTimeLeft: currentBlack,
      activeColor: this.activeColor
    };
  }
}
