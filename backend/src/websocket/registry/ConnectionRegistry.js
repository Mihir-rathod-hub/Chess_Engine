/**
 * Strategic Chess Connection & Presence Registry Abstraction Interface
 * Designed to encapsulate connection management so it can later be extended
 * for multi-instance distributed deployment (e.g., Redis Pub/Sub adapter).
 */
export class ConnectionRegistry {
  /**
   * Register an authenticated WebSocket connection for a user.
   */
  register(userId, connectionId, socket, metadata = {}) {}

  /**
   * Unregister a WebSocket connection.
   */
  unregister(userId, connectionId) {}

  /**
   * Get an active connection by userId and connectionId.
   */
  getConnection(userId, connectionId) {}

  /**
   * Get all active connections for a given userId.
   */
  getUserConnections(userId) {}

  /**
   * Check if a user currently has an active connection.
   */
  hasUser(userId) {}

  /**
   * Get count of unique connected authenticated users.
   */
  getActiveUserCount() {}

  /**
   * Broadcast a message to all active connections for a specific user.
   */
  broadcastToUser(userId, message) {}

  /**
   * Broadcast a message to all connected clients.
   */
  broadcastAll(message) {}

  /**
   * Close all registered connections cleanly.
   */
  closeAll() {}
}

/**
 * In-Memory Implementation of Connection Registry
 */
export class InMemoryConnectionRegistry extends ConnectionRegistry {
  constructor() {
    super();
    // Map<userId, Map<connectionId, { socket, metadata, connectedAt }>>
    this.userConnections = new Map();
  }

  register(userId, connectionId, socket, metadata = {}) {
    if (!this.userConnections.has(userId)) {
      this.userConnections.set(userId, new Map());
    }

    const userMap = this.userConnections.get(userId);
    userMap.set(connectionId, {
      socket,
      metadata,
      connectedAt: new Date().toISOString()
    });
  }

  unregister(userId, connectionId) {
    if (!this.userConnections.has(userId)) return false;

    const userMap = this.userConnections.get(userId);
    const deleted = userMap.delete(connectionId);

    if (userMap.size === 0) {
      this.userConnections.delete(userId);
    }

    return deleted;
  }

  getConnection(userId, connectionId) {
    const userMap = this.userConnections.get(userId);
    if (!userMap) return null;
    return userMap.get(connectionId) || null;
  }

  getUserConnections(userId) {
    const userMap = this.userConnections.get(userId);
    if (!userMap) return [];
    return Array.from(userMap.values());
  }

  hasUser(userId) {
    const userMap = this.userConnections.get(userId);
    return Boolean(userMap && userMap.size > 0);
  }

  getActiveUserCount() {
    return this.userConnections.size;
  }

  getMetadata(userId) {
    const userMap = this.userConnections.get(userId);
    if (!userMap || userMap.size === 0) return null;
    const firstConn = userMap.values().next().value;
    return firstConn?.metadata || null;
  }

  getTotalConnectionCount() {
    let count = 0;
    for (const userMap of this.userConnections.values()) {
      count += userMap.size;
    }
    return count;
  }

  sendJson(socket, data) {
    if (socket && socket.readyState === 1) { // 1 = OPEN
      try {
        const payload = typeof data === 'string' ? data : JSON.stringify(data);
        socket.send(payload);
        return true;
      } catch (err) {
        return false;
      }
    }
    return false;
  }

  broadcastToUser(userId, message) {
    const connections = this.getUserConnections(userId);
    let sentCount = 0;
    for (const conn of connections) {
      if (this.sendJson(conn.socket, message)) {
        sentCount++;
      }
    }
    return sentCount;
  }

  broadcastAll(message) {
    let sentCount = 0;
    for (const userMap of this.userConnections.values()) {
      for (const conn of userMap.values()) {
        if (this.sendJson(conn.socket, message)) {
          sentCount++;
        }
      }
    }
    return sentCount;
  }

  closeAll() {
    for (const userMap of this.userConnections.values()) {
      for (const conn of userMap.values()) {
        try {
          if (conn.socket && conn.socket.readyState <= 1) {
            conn.socket.close(1001, 'Server shutting down');
          }
        } catch (e) {
          // Ignore close errors during shutdown
        }
      }
    }
    this.userConnections.clear();
  }
}

// Global default instance for the backend application
export const connectionRegistry = new InMemoryConnectionRegistry();
