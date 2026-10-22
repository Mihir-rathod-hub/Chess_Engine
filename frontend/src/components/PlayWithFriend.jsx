import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, Copy, CheckCircle, ArrowRight, Loader2, AlertCircle, Users, Clock, ShieldCheck } from 'lucide-react';
import { getValidSessionToken, gameSocket } from '../lib/websocket';
import { createFriendRoom, getFriendRoom, joinFriendRoom, startFriendGame } from '../lib/api';

/**
 * PlayWithFriend Component
 * Recreates the exact visual structure from Screenshots 1 & 2:
 * - Pure black aesthetic with high contrast white action buttons
 * - Condensed Anton uppercase typography
 * - Real server-authoritative room creation & joining
 * - Real-time WebSocket synchronization & game launch
 */
export default function PlayWithFriend({
  user,
  profile,
  onBack,
  onGameMatched, // Callback passing authoritative game.matched payload to launch game
  initialRoomCode = '',
  initialTab = 'create'
}) {
  const [tab, setTab] = useState(initialTab); // 'create' | 'join'
  
  // Create Room States
  const [createdRoomCode, setCreatedRoomCode] = useState('');
  const [createdRoomId, setCreatedRoomId] = useState(null);
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [createError, setCreateError] = useState(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [timeControl, setTimeControl] = useState('10min');
  const [isWaitingForFriend, setIsWaitingForFriend] = useState(false);
  const [joinedFriendInfo, setJoinedFriendInfo] = useState(null);
  const [isStartingGame, setIsStartingGame] = useState(false);

  // Join Room States
  const [joinCodeInput, setJoinCodeInput] = useState(initialRoomCode || '');
  const [isJoiningRoom, setIsJoiningRoom] = useState(false);
  const [joinError, setJoinError] = useState(null);
  const [joinedRoomSuccess, setJoinedRoomSuccess] = useState(null); // { roomCode, host }

  // Check URL query parameters on mount for deep links (e.g. ?room=STRAT-5528)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room') || params.get('code');
    if (roomParam) {
      const normalized = normalizeRoomCodeInput(roomParam);
      setJoinCodeInput(normalized);
      setTab('join');
    }
  }, []);

  // Helper to normalize room code input (removes URLs, trims, uppercase)
  const normalizeRoomCodeInput = (raw) => {
    if (!raw) return '';
    let val = raw.trim();
    if (val.includes('?')) {
      try {
        const u = new URLSearchParams(val.split('?')[1]);
        const r = u.get('room') || u.get('code');
        if (r) val = r;
      } catch (_) {
        const match = val.match(/[?&](?:room|code)=([A-Za-z0-9-]+)/i);
        if (match) val = match[1];
      }
    }
    val = val.toUpperCase().replace(/[^A-Z0-9-]/g, '');
    if (val && !val.startsWith('STRAT-') && val.length <= 6) {
      val = `STRAT-${val}`;
    }
    return val;
  };

  // 1. Authoritative Room Creation Flow
  const handleCreateRoom = async (tc = timeControl) => {
    setIsCreatingRoom(true);
    setCreateError(null);
    setJoinedFriendInfo(null);
    setIsWaitingForFriend(false);

    try {
      const token = await getValidSessionToken();

      // Ensure WebSocket connection is ready
      try {
        await gameSocket.connect(token);
      } catch (wsErr) {
        console.warn('WS connect warning on room create:', wsErr.message);
      }

      // Create room via authoritative REST endpoint
      const res = await createFriendRoom(token, { timeControl: tc });
      if (res.success && res.data?.roomCode) {
        setCreatedRoomCode(res.data.roomCode);
        setCreatedRoomId(res.data.roomId);
      } else {
        throw new Error(res.error?.message || 'Failed to create private room on server.');
      }
    } catch (err) {
      console.error('Create room error:', err);
      setCreateError(err.message || 'Could not create game room. Please check your connection.');
    } finally {
      setIsCreatingRoom(false);
    }
  };

  // Automatically create a room when entering 'create' tab if none exists yet
  useEffect(() => {
    if (tab === 'create' && !createdRoomCode && !isCreatingRoom && !createError) {
      handleCreateRoom(timeControl);
    }
  }, [tab]);

  // 2. WebSocket Listener for Friend Room Events
  useEffect(() => {
    // A. When friend joins creator's room
    const unsubPlayerJoined = gameSocket.on('friend.player_joined', (data) => {
      if (data.payload && data.payload.roomCode === createdRoomCode) {
        setJoinedFriendInfo(data.payload.player || { name: 'Friend' });
        // If creator was already waiting, auto-trigger start
        if (isWaitingForFriend) {
          handleTriggerStart(createdRoomCode);
        }
      }
    });

    // B. When match starts, server broadcasts game.matched
    const unsubGameMatched = gameSocket.on('game.matched', (data) => {
      if (data.payload) {
        setIsStartingGame(false);
        setIsWaitingForFriend(false);
        if (typeof onGameMatched === 'function') {
          onGameMatched(data.payload);
        }
      }
    });

    // C. When friend leaves waiting room
    const unsubPlayerLeft = gameSocket.on('friend.player_left', (data) => {
      if (data.payload && data.payload.roomCode === createdRoomCode) {
        setJoinedFriendInfo(null);
      }
    });

    // D. When creator cancels room
    const unsubRoomCancelled = gameSocket.on('friend.room_cancelled', (data) => {
      setJoinedRoomSuccess(null);
      setJoinError('The host has left or cancelled this game room.');
    });

    return () => {
      unsubPlayerJoined();
      unsubGameMatched();
      unsubPlayerLeft();
      unsubRoomCancelled();
    };
  }, [createdRoomCode, isWaitingForFriend, onGameMatched]);

  // 3. Copy Invite Link to Clipboard
  const handleCopyLink = () => {
    if (!createdRoomCode) return;
    const inviteUrl = `${window.location.origin}/play?room=${createdRoomCode}`;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(inviteUrl).then(() => {
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2500);
      }).catch(() => fallbackCopy(inviteUrl));
    } else {
      fallbackCopy(inviteUrl);
    }
  };

  const fallbackCopy = (text) => {
    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-9999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2500);
    } catch (e) {
      alert(`Room Invite Link: ${text}`);
    }
  };

  // 4. Creator clicks "START FRIEND GAME"
  const handleStartFriendGameClick = () => {
    if (!createdRoomCode) return;

    if (joinedFriendInfo) {
      // Friend already joined: start game immediately
      handleTriggerStart(createdRoomCode);
    } else {
      // Friend not joined yet: enter waiting state
      setIsWaitingForFriend(true);
    }
  };

  // Trigger authoritative game start on server
  const handleTriggerStart = async (code) => {
    setIsStartingGame(true);
    setCreateError(null);

    try {
      const token = await getValidSessionToken();
      await gameSocket.connect(token);

      const res = await startFriendGame(token, code);
      if (!res.success) {
        throw new Error(res.error?.message || 'Failed to start game with friend.');
      }
      // Note: game.matched event will arrive via WebSocket and trigger onGameMatched!
    } catch (err) {
      console.error('Start friend game error:', err);
      setIsStartingGame(false);
      setCreateError(err.message || 'Could not start match. Both players must be present.');
    }
  };

  // 5. Join Room Flow
  const handleJoinRoom = async () => {
    const normalized = normalizeRoomCodeInput(joinCodeInput);
    if (!normalized || normalized.length < 5) {
      setJoinError('Please enter a valid room code (e.g. STRAT-8942).');
      return;
    }

    setIsJoiningRoom(true);
    setJoinError(null);

    try {
      const token = await getValidSessionToken();
      await gameSocket.connect(token);

      const res = await joinFriendRoom(token, normalized);
      if (res.success && res.data) {
        setJoinedRoomSuccess({
          roomCode: res.data.roomCode,
          host: res.data.host || { name: 'Host' },
          timeControl: res.data.timeControl
        });
        // Now joined: wait for host to start or listen for game.matched
      } else {
        throw new Error(res.error?.message || 'Failed to join game room.');
      }
    } catch (err) {
      console.error('Join room error:', err);
      setJoinError(err.message || 'Could not join room. Please check the code.');
    } finally {
      setIsJoiningRoom(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '1.5rem',
      maxWidth: '620px',
      margin: '0 auto',
      width: '100%',
      boxSizing: 'border-box'
    }}>
      {/* 1. TOP BAR: BACK NAVIGATION */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}>
        <button
          onClick={onBack}
          title="Back to Game Modes"
          style={{
            background: 'none',
            border: 'none',
            color: '#FFFFFF',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0.4rem',
            borderRadius: '8px',
            marginLeft: '-0.4rem',
            transition: 'opacity 0.15s ease'
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.7')}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
        >
          <ChevronLeft size={28} />
        </button>
      </div>

      {/* 2. HEADER: BOLD CONDENSED TITLE & SUBTITLE (Exact Screenshot Match) */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <h1 style={{
          fontFamily: "'Anton', 'Bebas Neue', sans-serif",
          fontSize: 'clamp(2.75rem, 6vw, 3.75rem)',
          margin: 0,
          color: '#FFFFFF',
          lineHeight: 0.95,
          letterSpacing: '0.02em',
          textTransform: 'uppercase'
        }}>
          PLAY WITH<br />FRIEND
        </h1>
        <p style={{
          color: '#A1A1AA',
          fontSize: '1rem',
          margin: '0.75rem 0 0 0',
          fontWeight: 500
        }}>
          Create a game room or join your friend's room with a code.
        </p>
      </div>

      {/* 3. MAIN CARD CONTAINER (Exact Screenshot Match) */}
      <div style={{
        backgroundColor: '#0C0C0F',
        border: '1px solid #1E1E24',
        borderRadius: '24px',
        padding: '1.75rem 2rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.5rem',
        boxShadow: '0 12px 40px rgba(0, 0, 0, 0.8)'
      }}>
        {/* SEGMENTED CONTROL: CREATE GAME ROOM vs JOIN GAME ROOM */}
        <div style={{
          display: 'flex',
          backgroundColor: '#18181D',
          padding: '0.35rem',
          borderRadius: '14px',
          border: '1px solid #222228'
        }}>
          <button
            onClick={() => {
              setTab('create');
              setJoinError(null);
            }}
            style={{
              flex: 1,
              padding: '0.75rem',
              borderRadius: '10px',
              border: tab === 'create' ? '1px solid rgba(255, 255, 255, 0.1)' : 'none',
              backgroundColor: tab === 'create' ? '#25252D' : 'transparent',
              color: tab === 'create' ? '#FFFFFF' : '#8E8E93',
              fontWeight: 800,
              fontSize: '0.88rem',
              cursor: 'pointer',
              transition: 'all 0.18s ease'
            }}
          >
            Create Game Room
          </button>
          <button
            onClick={() => {
              setTab('join');
              setCreateError(null);
            }}
            style={{
              flex: 1,
              padding: '0.75rem',
              borderRadius: '10px',
              border: tab === 'join' ? '1px solid rgba(255, 255, 255, 0.1)' : 'none',
              backgroundColor: tab === 'join' ? '#25252D' : 'transparent',
              color: tab === 'join' ? '#FFFFFF' : '#8E8E93',
              fontWeight: 800,
              fontSize: '0.88rem',
              cursor: 'pointer',
              transition: 'all 0.18s ease'
            }}
          >
            Join Game Room
          </button>
        </div>

        {/* ======================================================== */}
        {/* TAB 1: CREATE GAME ROOM (Screenshot 1 Match)             */}
        {/* ======================================================== */}
        {tab === 'create' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {createError && (
              <div style={{
                backgroundColor: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid #EF4444',
                borderRadius: '12px',
                padding: '0.85rem 1rem',
                color: '#EF4444',
                fontSize: '0.88rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '0.65rem'
              }}>
                <AlertCircle size={18} style={{ flexShrink: 0 }} />
                <span>{createError}</span>
              </div>
            )}

            {/* ROOM INFORMATION PANEL */}
            <div style={{
              backgroundColor: '#18181D',
              border: '1px solid #24242C',
              borderRadius: '16px',
              padding: '1.25rem 1.5rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1rem',
              flexWrap: 'wrap'
            }}>
              <div>
                <div style={{
                  fontSize: '0.7rem',
                  fontWeight: 800,
                  color: '#8E8E93',
                  letterSpacing: '1.4px',
                  textTransform: 'uppercase'
                }}>
                  ROOM CODE
                </div>
                <div style={{
                  fontFamily: "'Anton', sans-serif",
                  fontSize: '2.1rem',
                  letterSpacing: '2px',
                  color: '#FFFFFF',
                  marginTop: '0.1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem'
                }}>
                  {isCreatingRoom ? (
                    <span style={{ fontSize: '1.2rem', color: '#8E8E93' }}>Generating...</span>
                  ) : (
                    createdRoomCode || 'STRAT-....'
                  )}
                </div>
              </div>

              {/* COPY INVITE LINK BUTTON (Screenshot 1 Match) */}
              <button
                onClick={handleCopyLink}
                disabled={isCreatingRoom || !createdRoomCode}
                style={{
                  backgroundColor: linkCopied ? '#10B981' : '#FFFFFF',
                  color: linkCopied ? '#FFFFFF' : '#000000',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '0.7rem 1.25rem',
                  fontWeight: 800,
                  fontSize: '0.85rem',
                  cursor: (isCreatingRoom || !createdRoomCode) ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  transition: 'all 0.18s ease',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                  flexShrink: 0
                }}
              >
                {linkCopied ? <CheckCircle size={16} /> : <Copy size={16} />}
                <span>{linkCopied ? 'Copied!' : 'Copy Invite Link'}</span>
              </button>
            </div>

            {/* FRIEND PRESENCE STATUS BADGE */}
            {joinedFriendInfo ? (
              <div style={{
                backgroundColor: 'rgba(16, 185, 129, 0.12)',
                border: '1px solid #10B981',
                borderRadius: '12px',
                padding: '0.85rem 1.2rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                color: '#10B981'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                  <Users size={18} />
                  <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>
                    {joinedFriendInfo.name || 'Friend'} joined!
                  </span>
                </div>
                <span style={{ fontSize: '0.78rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px' }}>
                  Ready to Start
                </span>
              </div>
            ) : isWaitingForFriend ? (
              <div style={{
                backgroundColor: 'rgba(99, 102, 241, 0.12)',
                border: '1px solid rgba(99, 102, 241, 0.4)',
                borderRadius: '12px',
                padding: '0.85rem 1.2rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                color: '#818CF8'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                  <Loader2 size={18} className="spin-animation" style={{ animation: 'spin 1.2s linear infinite' }} />
                  <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                    Waiting for your friend to enter code {createdRoomCode}...
                  </span>
                </div>
                <button
                  onClick={() => setIsWaitingForFriend(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#A1A1AA',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    textDecoration: 'underline'
                  }}
                >
                  Cancel
                </button>
              </div>
            ) : null}

            {/* START FRIEND GAME BUTTON (Screenshot 1 Match) */}
            <button
              onClick={handleStartFriendGameClick}
              disabled={isCreatingRoom || isStartingGame || !createdRoomCode}
              style={{
                backgroundColor: '#FFFFFF',
                color: '#000000',
                border: 'none',
                borderRadius: '16px',
                padding: '1.15rem',
                fontWeight: 800,
                fontSize: '1.1rem',
                fontFamily: "'Anton', sans-serif",
                letterSpacing: '0.04em',
                cursor: (isCreatingRoom || isStartingGame || !createdRoomCode) ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.75rem',
                opacity: (isCreatingRoom || isStartingGame || !createdRoomCode) ? 0.6 : 1,
                transition: 'transform 0.15s ease, opacity 0.15s ease',
                marginTop: '0.25rem'
              }}
              onMouseEnter={(e) => {
                if (!isCreatingRoom && !isStartingGame && createdRoomCode) {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              {isStartingGame ? (
                <>
                  <Loader2 size={20} style={{ animation: 'spin 1.2s linear infinite' }} />
                  <span>STARTING MATCH...</span>
                </>
              ) : isWaitingForFriend && !joinedFriendInfo ? (
                <>
                  <Loader2 size={20} style={{ animation: 'spin 1.2s linear infinite' }} />
                  <span>WAITING FOR FRIEND...</span>
                </>
              ) : (
                <>
                  <span>START FRIEND GAME</span>
                  <ArrowRight size={20} />
                </>
              )}
            </button>
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 2: JOIN GAME ROOM (Screenshot 2 Match)               */}
        {/* ======================================================== */}
        {tab === 'join' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {joinError && (
              <div style={{
                backgroundColor: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid #EF4444',
                borderRadius: '12px',
                padding: '0.85rem 1rem',
                color: '#EF4444',
                fontSize: '0.88rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '0.65rem'
              }}>
                <AlertCircle size={18} style={{ flexShrink: 0 }} />
                <span>{joinError}</span>
              </div>
            )}

            {/* JOIN SUCCESS / WAITING FOR HOST BADGE */}
            {joinedRoomSuccess ? (
              <div style={{
                backgroundColor: 'rgba(16, 185, 129, 0.12)',
                border: '1px solid #10B981',
                borderRadius: '14px',
                padding: '1.25rem 1.5rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
                color: '#10B981'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                  <CheckCircle size={20} />
                  <span style={{ fontWeight: 800, fontSize: '1rem' }}>
                    Successfully Joined Room {joinedRoomSuccess.roomCode}!
                  </span>
                </div>
                <div style={{
                  color: '#D1D5DB',
                  fontSize: '0.88rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  <Clock size={16} />
                  <span>Waiting for host ({joinedRoomSuccess.host.name || 'Friend'}) to start the match...</span>
                </div>
              </div>
            ) : (
              <div>
                <label style={{
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  letterSpacing: '1.4px',
                  color: '#8E8E93',
                  textTransform: 'uppercase',
                  display: 'block'
                }}>
                  ENTER ROOM CODE
                </label>
                <input
                  type="text"
                  value={joinCodeInput}
                  onChange={(e) => {
                    setJoinCodeInput(e.target.value.toUpperCase());
                    setJoinError(null);
                  }}
                  onPaste={(e) => {
                    // Auto-normalize pasted URLs
                    setTimeout(() => {
                      setJoinCodeInput((prev) => normalizeRoomCodeInput(prev));
                    }, 50);
                  }}
                  placeholder="e.g. STRAT-8942"
                  disabled={isJoiningRoom}
                  style={{
                    width: '100%',
                    marginTop: '0.5rem',
                    padding: '1rem 1.25rem',
                    borderRadius: '14px',
                    backgroundColor: '#18181D',
                    border: '1px solid #2E2E36',
                    color: '#FFFFFF',
                    fontFamily: "'Outfit', sans-serif",
                    fontWeight: 800,
                    fontSize: '1.2rem',
                    letterSpacing: '1.5px',
                    boxSizing: 'border-box',
                    outline: 'none',
                    transition: 'border-color 0.15s ease'
                  }}
                  onFocus={(e) => (e.target.style.borderColor = '#818CF8')}
                  onBlur={(e) => (e.target.style.borderColor = '#2E2E36')}
                />
              </div>
            )}

            {/* JOIN GAME ROOM BUTTON (Screenshot 2 Match) */}
            {!joinedRoomSuccess && (
              <button
                onClick={handleJoinRoom}
                disabled={isJoiningRoom || !joinCodeInput.trim()}
                style={{
                  backgroundColor: '#FFFFFF',
                  color: '#000000',
                  border: 'none',
                  borderRadius: '16px',
                  padding: '1.15rem',
                  fontWeight: 800,
                  fontSize: '1.1rem',
                  fontFamily: "'Anton', sans-serif",
                  letterSpacing: '0.04em',
                  cursor: (isJoiningRoom || !joinCodeInput.trim()) ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.75rem',
                  opacity: (isJoiningRoom || !joinCodeInput.trim()) ? 0.6 : 1,
                  transition: 'transform 0.15s ease, opacity 0.15s ease',
                  marginTop: '0.25rem'
                }}
                onMouseEnter={(e) => {
                  if (!isJoiningRoom && joinCodeInput.trim()) {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                {isJoiningRoom ? (
                  <>
                    <Loader2 size={20} style={{ animation: 'spin 1.2s linear infinite' }} />
                    <span>VERIFYING ROOM...</span>
                  </>
                ) : (
                  <>
                    <span>JOIN GAME ROOM</span>
                    <ArrowRight size={20} />
                  </>
                )}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Embedded CSS for spinner animation */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
