/**
 * Strategic Chess Backend API Client Helper
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

/**
 * Health Check API Call
 */
export async function checkBackendHealth() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/health`);
    return await res.json();
  } catch (err) {
    console.warn('Backend Health Check Error:', err);
    return { success: false, error: { message: err.message, code: 'NETWORK_ERROR' } };
  }
}

/**
 * Authenticated User Profile API Call (GET /api/auth/me)
 */
export async function getAuthenticatedUserProfile(accessToken) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/auth/me`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    return await res.json();
  } catch (err) {
    console.warn('Auth Me API Error:', err);
    return { success: false, error: { message: err.message, code: 'NETWORK_ERROR' } };
  }
}

/**
 * Authenticated Match History API Call (GET /api/games/history)
 */
export async function getMatchHistory(accessToken, options = {}) {
  try {
    const params = new URLSearchParams();
    if (options.limit) params.set('limit', options.limit);
    if (options.offset) params.set('offset', options.offset);
    const queryString = params.toString() ? `?${params.toString()}` : '';

    const res = await fetch(`${API_BASE_URL}/api/games/history${queryString}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    return await res.json();
  } catch (err) {
    console.warn('Match History API Error:', err);
    return { success: false, error: { message: err.message, code: 'NETWORK_ERROR' } };
  }
}

/**
 * Authenticated Game Details API Call (GET /api/games/:id)
 */
export async function getGameDetails(accessToken, gameId) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/games/${gameId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    return await res.json();
  } catch (err) {
    console.warn('Game Details API Error:', err);
    return { success: false, error: { message: err.message, code: 'NETWORK_ERROR' } };
  }
}

/**
 * Chess News Feed API Call (GET /api/news)
 */
export async function getChessNewsFeed(options = {}) {
  try {
    const params = new URLSearchParams();
    if (options.category && options.category !== 'ALL') params.set('category', options.category);
    if (options.sort) params.set('sort', options.sort);
    if (options.refresh) {
      params.set('refresh', 'true');
      params.set('_t', Date.now().toString());
    }
    if (options.limit) params.set('limit', options.limit);
    if (options.offset) params.set('offset', options.offset);
    const queryString = params.toString() ? `?${params.toString()}` : '';

    const res = await fetch(`${API_BASE_URL}/api/news${queryString}`, {
      cache: options.refresh ? 'no-store' : 'default',
      headers: {
        'Accept': 'application/json'
      }
    });
    return await res.json();
  } catch (err) {
    console.warn('Chess News API Error:', err);
    return { success: false, error: { message: err.message, code: 'NETWORK_ERROR' } };
  }
}

/**
 * Friend Room: Create Room (POST /api/rooms/create)
 */
export async function createFriendRoom(accessToken, options = {}) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/rooms/create`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        timeControl: options.timeControl || '10min',
        gameType: 'friendly'
      })
    });
    return await res.json();
  } catch (err) {
    console.warn('Create Friend Room API Error:', err);
    return { success: false, error: { message: err.message, code: 'NETWORK_ERROR' } };
  }
}

/**
 * Friend Room: Get Room Details (GET /api/rooms/:code)
 */
export async function getFriendRoom(accessToken, roomCode) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/rooms/${encodeURIComponent(roomCode)}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    });
    return await res.json();
  } catch (err) {
    console.warn('Get Friend Room API Error:', err);
    return { success: false, error: { message: err.message, code: 'NETWORK_ERROR' } };
  }
}

/**
 * Friend Room: Join Room (POST /api/rooms/:code/join)
 */
export async function joinFriendRoom(accessToken, roomCode) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/rooms/${encodeURIComponent(roomCode)}/join`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    });
    return await res.json();
  } catch (err) {
    console.warn('Join Friend Room API Error:', err);
    return { success: false, error: { message: err.message, code: 'NETWORK_ERROR' } };
  }
}

/**
 * Friend Room: Start Match (POST /api/rooms/:code/start)
 */
export async function startFriendGame(accessToken, roomCode) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/rooms/${encodeURIComponent(roomCode)}/start`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    });
    return await res.json();
  } catch (err) {
    console.warn('Start Friend Game API Error:', err);
    return { success: false, error: { message: err.message, code: 'NETWORK_ERROR' } };
  }
}


