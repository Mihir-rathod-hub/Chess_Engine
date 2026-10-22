/**
 * Strategic Chess WebSocket Client Abstraction (Step 4F)
 */
import { supabase } from './supabase';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const WS_BASE_URL = API_BASE_URL.replace(/^http/, 'ws') + '/ws';

/**
 * Obtain a valid current Supabase access token before establishing or re-establishing WebSocket.
 * Refreshes session if token is missing, expired, or near expiry (< 60s).
 */
export async function getValidSessionToken() {
  let { data: { session }, error } = await supabase.auth.getSession();
  if (error) {
    throw new Error('Authentication session error: ' + error.message);
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const isExpiringSoon = session?.expires_at ? (session.expires_at - nowSec <= 60) : false;

  // If session is absent, expired, or about to expire, explicitly refresh
  if (!session || !session.access_token || isExpiringSoon) {
    const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError || !refreshData?.session?.access_token) {
      if (!session?.access_token) {
        throw new Error('Authentication session required. Please sign in again.');
      }
      if (session.expires_at && session.expires_at <= nowSec) {
        throw new Error('Invalid or expired authentication token. Please sign in again.');
      }
      return session.access_token;
    }
    return refreshData.session.access_token;
  }

  return session.access_token;
}

export class GameWebSocketClient {
  constructor() {
    this.socket = null;
    this.token = null;
    this.listeners = new Map(); // Map<type, Set<callback>>
    this.isConnected = false;
    this.isConnecting = false;
    this.pendingRequests = new Map(); // Map<requestId, { resolve, reject, timeout }>
    this.requestIdCounter = 0;
  }

  async connect(token) {
    if (!token) {
      throw new Error('Authentication token required for WebSocket connection.');
    }

    // If socket is already OPEN and was authenticated with this exact token, reuse it
    if (this.isConnected && this.token === token && this.socket?.readyState === WebSocket.OPEN) {
      return true;
    }

    // If an existing socket exists with a different/stale token or not OPEN, cleanly disconnect first
    if (this.socket) {
      this.disconnect();
    }

    this.token = token;
    this.isConnecting = true;

    return new Promise((resolve, reject) => {
      const wsUrl = `${WS_BASE_URL}?token=${encodeURIComponent(token)}`;
      
      try {
        this.socket = new WebSocket(wsUrl);
      } catch (err) {
        this.isConnecting = false;
        this.token = null;
        return reject(err);
      }

      const connectionTimeout = setTimeout(() => {
        if (this.isConnecting) {
          this.disconnect();
          reject(new Error('WebSocket connection timeout. Is the backend server running?'));
        }
      }, 5000);

      this.socket.onopen = () => {
        // Connection opened; waiting for server connection.authenticated message
      };

      this.socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          
          if (message.type === 'connection.authenticated') {
            clearTimeout(connectionTimeout);
            this.isConnected = true;
            this.isConnecting = false;
            resolve(true);
          } else if (message.type === 'system.error' && !this.isConnected) {
            clearTimeout(connectionTimeout);
            this.isConnecting = false;
            this.token = null;
            reject(new Error(message.error?.message || 'WebSocket authentication failed.'));
          }

          // Resolve matching requestId promise if present
          if (message.requestId && this.pendingRequests.has(message.requestId)) {
            const { resolve: reqResolve, reject: reqReject, timeout } = this.pendingRequests.get(message.requestId);
            clearTimeout(timeout);
            this.pendingRequests.delete(message.requestId);
            
            if (message.type === 'system.error' || message.type === 'game.error') {
              reqReject(new Error(message.error?.message || 'Server error.'));
            } else {
              reqResolve(message);
            }
          } else if (message.type === 'game.matched') {
            // When game.matched arrives, immediately resolve any pending matchmaking request to prevent timeouts
            for (const [pReqId, pReq] of this.pendingRequests.entries()) {
              clearTimeout(pReq.timeout);
              this.pendingRequests.delete(pReqId);
              pReq.resolve(message);
            }
          }

          // Broadcast to type-specific and wildcard listeners
          this._notifyListeners(message.type, message);
          this._notifyListeners('*', message);
        } catch (err) {
          console.warn('WebSocket message parse error:', err);
        }
      };

      this.socket.onerror = (err) => {
        if (this.isConnecting) {
          clearTimeout(connectionTimeout);
          this.isConnecting = false;
          this.token = null;
          reject(new Error('WebSocket connection error. Make sure the backend server is running at ' + WS_BASE_URL));
        }
        this._notifyListeners('error', err);
      };

      this.socket.onclose = (event) => {
        this.isConnected = false;
        this.isConnecting = false;
        this.token = null;
        this._notifyListeners('close', event);
      };
    });
  }

  send(type, payload = {}) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected.');
    }

    const requestId = `req_${Date.now()}_${++this.requestIdCounter}`;
    const message = {
      type,
      version: 1,
      requestId,
      payload
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reject(new Error(`Request timeout for message type "${type}".`));
        }
      }, 10000);

      this.pendingRequests.set(requestId, { resolve, reject, timeout });
      this.socket.send(JSON.stringify(message));
    });
  }

  on(type, callback) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type).add(callback);

    return () => {
      if (this.listeners.has(type)) {
        this.listeners.get(type).delete(callback);
      }
    };
  }

  _notifyListeners(type, data) {
    if (this.listeners.has(type)) {
      this.listeners.get(type).forEach((callback) => {
        try {
          callback(data);
        } catch (err) {
          console.error(`Error in WebSocket listener for ${type}:`, err);
        }
      });
    }
  }

  disconnect() {
    this.isConnected = false;
    this.isConnecting = false;
    this.token = null;
    
    for (const [requestId, { reject, timeout }] of this.pendingRequests.entries()) {
      clearTimeout(timeout);
      reject(new Error('WebSocket disconnected.'));
    }
    this.pendingRequests.clear();

    if (this.socket) {
      try {
        this.socket.onopen = null;
        this.socket.onmessage = null;
        this.socket.onerror = null;
        this.socket.onclose = null;
        this.socket.close();
      } catch (e) {}
      this.socket = null;
    }
  }
}

export const gameSocket = new GameWebSocketClient();
