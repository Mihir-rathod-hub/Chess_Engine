import React, { useState, useEffect, useRef } from 'react';

/**
 * BotMessageBubble
 * 
 * Floating thought/speech bubble for the companion bot with:
 * - Robust Typewriter State Machine:
 *   1. Initial mount: types out character-by-character from empty to complete message, then remains visible.
 *   2. Message change: deletes character-by-character down to empty, pauses briefly, then types the new message character-by-character.
 *   3. Sits completely stable and visible in IDLE mode without flickering or restarting on re-renders.
 *   4. Zero simultaneous timers, smooth handling of rapid hover transitions.
 * - Subtle, accurate status indicator (ONLINE when finished, TRANSMITTING when typing, THINKING when deleting).
 * - Futuristic glassmorphic styling matching Strategic Chess's pure black identity.
 */
export default function BotMessageBubble({
  targetMessage = 'Hello, player!',
  botName = 'STRATEGIC COMPANION',
  tagline = 'READY',
  typingSpeedMs = 26,
  deletingSpeedMs = 14,
  pauseBeforeTypeMs = 70
}) {
  const [displayedText, setDisplayedText] = useState('');
  const [phase, setPhase] = useState('TYPING'); // 'IDLE' | 'DELETING' | 'PAUSED' | 'TYPING'

  // Ref tracking current text in flight
  const displayedTextRef = useRef('');

  // Ref tracking target message
  const targetMessageRef = useRef(targetMessage);

  // Ref tracking phase to avoid stale state in timers
  const phaseRef = useRef('TYPING');

  // Single active timer ref
  const timerRef = useRef(null);

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const scheduleNextStep = (delayMs) => {
    clearTimer();
    timerRef.current = setTimeout(runStep, delayMs);
  };

  const runStep = () => {
    const current = displayedTextRef.current;
    const target = targetMessageRef.current;
    const currentPhase = phaseRef.current;

    // Phase: DELETING (erasing backwards one character at a time down to empty)
    if (currentPhase === 'DELETING') {
      if (current.length > 0) {
        const next = current.slice(0, -1);
        displayedTextRef.current = next;
        setDisplayedText(next);

        if (next.length === 0) {
          // Reached completely empty bubble! Transition to PAUSED
          phaseRef.current = 'PAUSED';
          setPhase('PAUSED');
          scheduleNextStep(pauseBeforeTypeMs);
        } else {
          scheduleNextStep(deletingSpeedMs);
        }
      } else {
        // Already empty
        phaseRef.current = 'PAUSED';
        setPhase('PAUSED');
        scheduleNextStep(pauseBeforeTypeMs);
      }
      return;
    }

    // Phase: PAUSED (brief pause on empty bubble before typing new message)
    if (currentPhase === 'PAUSED') {
      phaseRef.current = 'TYPING';
      setPhase('TYPING');

      if (target.length > 0) {
        const next = target.slice(0, 1);
        displayedTextRef.current = next;
        setDisplayedText(next);

        if (next === target) {
          phaseRef.current = 'IDLE';
          setPhase('IDLE');
        } else {
          scheduleNextStep(typingSpeedMs);
        }
      } else {
        phaseRef.current = 'IDLE';
        setPhase('IDLE');
      }
      return;
    }

    // Phase: TYPING (appending one character at a time until full target is reached)
    if (currentPhase === 'TYPING') {
      if (current.length < target.length) {
        const next = target.slice(0, current.length + 1);
        displayedTextRef.current = next;
        setDisplayedText(next);

        if (next === target) {
          // Finished typing complete message! Settle peacefully into IDLE
          phaseRef.current = 'IDLE';
          setPhase('IDLE');
        } else {
          scheduleNextStep(typingSpeedMs);
        }
      } else {
        phaseRef.current = 'IDLE';
        setPhase('IDLE');
      }
      return;
    }

    // Phase: IDLE (message complete and resting)
    if (currentPhase === 'IDLE') {
      if (current !== target) {
        // Target changed while we were idle
        if (current.length > 0) {
          phaseRef.current = 'DELETING';
          setPhase('DELETING');
          scheduleNextStep(deletingSpeedMs);
        } else {
          phaseRef.current = 'TYPING';
          setPhase('TYPING');
          scheduleNextStep(typingSpeedMs);
        }
      }
      return;
    }
  };

  // Watch for external targetMessage updates
  useEffect(() => {
    // If targetMessage hasn't changed from current target ref, ignore (e.g. parent re-render)
    if (targetMessage === targetMessageRef.current) {
      return;
    }

    targetMessageRef.current = targetMessage;

    // If current text already equals new target, remain in IDLE
    if (displayedTextRef.current === targetMessage) {
      phaseRef.current = 'IDLE';
      setPhase('IDLE');
      clearTimer();
      return;
    }

    // If text is currently displayed, delete it first
    if (displayedTextRef.current.length > 0) {
      phaseRef.current = 'DELETING';
      setPhase('DELETING');
      clearTimer();
      scheduleNextStep(deletingSpeedMs);
    } else {
      // If currently empty, start typing directly
      phaseRef.current = 'TYPING';
      setPhase('TYPING');
      clearTimer();
      scheduleNextStep(typingSpeedMs);
    }
  }, [targetMessage, typingSpeedMs, deletingSpeedMs, pauseBeforeTypeMs]);

  // Initial mount: begin typing the initial target message
  useEffect(() => {
    displayedTextRef.current = '';
    setDisplayedText('');
    phaseRef.current = 'TYPING';
    setPhase('TYPING');
    scheduleNextStep(120);

    return () => {
      clearTimer();
    };
  }, []);

  return (
    <div
      className="bot-bubble-wrapper"
      style={{
        position: 'relative',
        maxWidth: '560px',
        width: '100%',
        filter: 'drop-shadow(0 14px 34px rgba(0, 0, 0, 0.85))'
      }}
    >
      {/* Sleek Glassmorphic Speech Bubble Container */}
      <div style={{
        position: 'relative',
        backgroundColor: '#08080C',
        borderRadius: '16px',
        border: '1px solid rgba(99, 102, 241, 0.35)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.95), 0 0 20px rgba(99, 102, 241, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
        padding: '0.95rem 1.35rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.45rem',
        backdropFilter: 'blur(16px)',
        zIndex: 2
      }}>
        {/* Header Bar with Live Companion Status */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.75rem',
          paddingBottom: '0.35rem',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {/* Pulsing Status Dot */}
            <span style={{
              position: 'relative',
              display: 'flex',
              width: '8px',
              height: '8px'
            }}>
              <span style={{
                position: 'absolute',
                display: 'inline-flex',
                height: '100%',
                width: '100%',
                borderRadius: '50%',
                backgroundColor: '#818CF8',
                opacity: 0.75,
                animation: 'ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite'
              }} />
              <span style={{
                position: 'relative',
                display: 'inline-flex',
                borderRadius: '50%',
                height: '8px',
                width: '8px',
                backgroundColor: '#6366F1'
              }} />
            </span>

            <span style={{
              fontSize: '0.7rem',
              fontWeight: 800,
              letterSpacing: '1px',
              textTransform: 'uppercase',
              color: '#818CF8'
            }}>
              {botName}
            </span>

            <span style={{
              fontSize: '0.62rem',
              fontWeight: 700,
              letterSpacing: '0.8px',
              textTransform: 'uppercase',
              color: '#8E8E93',
              padding: '0.1rem 0.45rem',
              borderRadius: '4px',
              backgroundColor: '#141418',
              border: '1px solid #1E1E22'
            }}>
              {tagline}
            </span>
          </div>

          {/* Accurate, Subtle Animation Status Indicator */}
          <span style={{
            fontSize: '0.62rem',
            fontWeight: 800,
            letterSpacing: '0.6px',
            color: phase === 'DELETING'
              ? '#A78BFA'
              : phase === 'TYPING' || phase === 'PAUSED'
                ? '#38BDF8'
                : '#71717A',
            transition: 'color 0.2s ease'
          }}>
            {phase === 'DELETING'
              ? 'THINKING...'
              : phase === 'TYPING' || phase === 'PAUSED'
                ? 'TRANSMITTING...'
                : 'ONLINE'}
          </span>
        </div>

        {/* Message Content Area with Fixed Min-Height to Prevent Layout Jitter */}
        <div style={{
          minHeight: '44px',
          display: 'flex',
          alignItems: 'center',
          fontSize: '0.98rem',
          lineHeight: 1.45,
          fontWeight: 600,
          color: '#F4F4F5',
          letterSpacing: '0.15px'
        }}>
          <span>{displayedText}</span>
          
          {/* Animated Blinking Caret */}
          <span
            style={{
              display: 'inline-block',
              width: '2px',
              height: '1.2em',
              backgroundColor: '#818CF8',
              marginLeft: '4px',
              verticalAlign: 'middle',
              animation: 'botCaretBlink 0.9s infinite',
              opacity: phase === 'IDLE' ? 0.5 : 1
            }}
          />
        </div>
      </div>

      {/* Pointer Tail pointing toward 3D Companion */}
      <div
        className="bot-bubble-tail"
        style={{
          position: 'absolute',
          left: '-13px',
          top: '50%',
          transform: 'translateY(-50%)',
          width: '14px',
          height: '22px',
          overflow: 'hidden',
          pointerEvents: 'none',
          zIndex: 3
        }}
      >
        <svg
          width="14"
          height="22"
          viewBox="0 0 14 22"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M14 2L1 11L14 20V2Z"
            fill="#08080C"
            stroke="rgba(99, 102, 241, 0.35)"
            strokeWidth="1.2"
          />
        </svg>
      </div>

      {/* Embedded Responsive & Keyframe Styles */}
      <style>{`
        @keyframes botCaretBlink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        @keyframes ping {
          75%, 100% {
            transform: scale(2);
            opacity: 0;
          }
        }
        @media (max-width: 680px) {
          .bot-bubble-tail {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}
