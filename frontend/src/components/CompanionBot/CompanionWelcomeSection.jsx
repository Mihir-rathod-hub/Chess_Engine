import React, { useState, useEffect, useCallback, useRef } from 'react';
import CompanionBot3D from './CompanionBot3D';
import BotMessageBubble from './BotMessageBubble';

/**
 * CompanionWelcomeSection
 * 
 * Replaces the static homepage greeting with:
 * 1. An interactive, animated 3D companion bot (Three.js) with smooth cursor tracking & idle floating
 * 2. An integrated futuristic thought/speech bubble with character-by-character typewriter deletion & retyping
 * 3. Contextual reaction to user hovers over homepage elements (Play, Puzzles, Learn, Rating, Activity)
 * 4. Responsive layout that adapts between side-by-side and mobile stacked
 */
export default function CompanionWelcomeSection({
  name = 'Player',
  rating = 1200,
  rankTitle = 'Apprentice',
  streak = 1,
  activeContext = null // Can be controlled externally or via context
}) {
  // Construct dynamic default greeting
  const defaultGreeting = name
    ? `Welcome back, ${name}! Ready for your next game?`
    : 'Welcome to Strategic Chess! Ready for your next game?';

  const [currentContext, setCurrentContext] = useState(null);
  const [targetMessage, setTargetMessage] = useState(defaultGreeting);

  // Return to default timer ref
  const resetTimerRef = useRef(null);

  // Contextual messages dictionary
  const getContextMessage = useCallback((ctx) => {
    switch (ctx) {
      case 'play':
      case 'quick-play':
        return 'Ready to test your skills? Face advanced AI or challenge players online!';
      case 'puzzles':
      case 'quick-puzzles':
        return 'Sharpen your tactical vision. Find the decisive winning continuation!';
      case 'learn':
      case 'quick-learn':
        return 'Study grandmaster patterns, endgame theory, and opening principles.';
      case 'rating':
        return typeof rating === 'number'
          ? `You stand at ${rating} ELO (${rankTitle}). Victory pushes you to the next rank!`
          : 'Compete in rated battles to forge your authoritative ELO ranking.';
      case 'activity':
      case 'calendar':
        return streak > 0
          ? `${streak}-day streak! Daily consistency is how grandmasters are built.`
          : 'Log a daily game to ignite your training streak!';
      case 'bot-avatar':
      case 'bot-companion':
        return "I'm your AI chess companion. Hover over homepage actions to plan your session!";
      case 'leaderboard':
        return 'Check the hall of fame. See who commands the top of the global leaderboards.';
      case 'news':
        return 'Read verified dispatches, championship updates, and grandmaster tournament reports.';
      case 'library':
      case 'books':
        return 'Discover master treatises, strategy guides, and foundational chess literature.';
      default:
        return defaultGreeting;
    }
  }, [defaultGreeting, rating, rankTitle, streak]);

  // Handle external or internal hover context changes
  const setHoverContext = useCallback((contextKey) => {
    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }

    if (contextKey) {
      setCurrentContext(contextKey);
      setTargetMessage(getContextMessage(contextKey));
    } else {
      // Graceful 350ms delay before returning to default message when unhovering
      resetTimerRef.current = setTimeout(() => {
        setCurrentContext(null);
        setTargetMessage(defaultGreeting);
      }, 350);
    }
  }, [defaultGreeting, getContextMessage]);

  // Track previous activeContext so we only trigger when it actually changes
  const prevActiveContextRef = useRef(activeContext);

  useEffect(() => {
    if (activeContext !== prevActiveContextRef.current) {
      prevActiveContextRef.current = activeContext;
      setHoverContext(activeContext);
    }
  }, [activeContext, setHoverContext]);

  // If user profile loads asynchronously after mount while idle, update default greeting without thrashing
  useEffect(() => {
    if (currentContext === null) {
      setTargetMessage((prev) => (prev !== defaultGreeting ? defaultGreeting : prev));
    }
  }, [defaultGreeting, currentContext]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (resetTimerRef.current) {
        clearTimeout(resetTimerRef.current);
      }
    };
  }, []);

  return (
    <div
      id="companion-welcome-container"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '2rem',
        width: '100%',
        padding: '1.25rem 0',
        flexWrap: 'wrap',
        position: 'relative',
        userSelect: 'none'
      }}
    >
      {/* 3D BOT COMPANION AVATAR WITH CONCENTRIC GLOW AURA */}
      <div style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0
      }}>
        {/* Concentric Aura Wave Rings (Matching Reference Image) */}
        <div style={{
          position: 'absolute',
          width: '210px',
          height: '210px',
          borderRadius: '50%',
          border: '1px solid rgba(99, 102, 241, 0.08)',
          pointerEvents: 'none',
          animation: 'pulseRing 4s ease-in-out infinite'
        }} />
        <div style={{
          position: 'absolute',
          width: '165px',
          height: '165px',
          borderRadius: '50%',
          border: '1px solid rgba(139, 92, 246, 0.12)',
          pointerEvents: 'none',
          animation: 'pulseRing 3s ease-in-out infinite 0.5s'
        }} />
        <div style={{
          position: 'absolute',
          width: '125px',
          height: '125px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(99, 102, 241, 0.22) 0%, rgba(139, 92, 246, 0.06) 60%, transparent 75%)',
          filter: 'blur(8px)',
          pointerEvents: 'none'
        }} />

        {/* 3D Canvas Element */}
        <CompanionBot3D
          size={120}
          onClick={() => setHoverContext('bot-companion')}
        />
      </div>

      {/* FLOATING THOUGHT / SPEECH BUBBLE WITH TYPEWRITER DELETION & RETYPING */}
      <div style={{ flex: '1 1 320px', minWidth: '280px' }}>
        <BotMessageBubble
          targetMessage={targetMessage}
          botName="STRATEGIC COMPANION"
          tagline={currentContext ? 'ANALYSIS' : 'READY'}
          typingSpeedMs={26}
          deletingSpeedMs={14}
          pauseBeforeTypeMs={70}
        />
      </div>

      {/* Concentric Ring Keyframe Animation */}
      <style>{`
        @keyframes pulseRing {
          0%, 100% {
            transform: scale(1);
            opacity: 0.6;
          }
          50% {
            transform: scale(1.06);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
