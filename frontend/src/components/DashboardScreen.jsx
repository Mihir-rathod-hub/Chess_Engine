import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Chess } from 'chess.js';
import {
  Trophy, LogOut, Play, Zap, ArrowUpRight, ChevronRight, ChevronLeft, Menu,
  Sparkles, Shield, User, Bell, CheckCircle, RefreshCw, X, Award,
  Swords, Puzzle, TrendingUp, Calendar, LayoutDashboard, GraduationCap,
  Book, Newspaper, Settings, Flame, Sun, Moon, Globe, Bot, Users, Copy, ArrowRight, Crown, BarChart3, RotateCcw, Flag, AlertCircle
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { gameSocket, getValidSessionToken } from '../lib/websocket';
import { getMatchHistory } from '../lib/api';
import PuzzlePlayer from './PuzzlePlayer';
import BooksLibrary from './BooksLibrary';
import NewsFeed from './NewsFeed';
import CompanionWelcomeSection from './CompanionBot/CompanionWelcomeSection';
import PlayWithFriend from './PlayWithFriend';
import LearnSection from './LearnSection';

// Pixel Hover Canvas Class adapted from React Bits PixelCard
class Pixel {
  constructor(canvas, context, x, y, color, speed, delay) {
    this.width = canvas.width;
    this.height = canvas.height;
    this.ctx = context;
    this.x = x;
    this.y = y;
    this.color = color;
    this.speed = (Math.random() * 0.8 + 0.1) * speed;
    this.size = 0;
    this.sizeStep = Math.random() * 0.4;
    this.minSize = 0.5;
    this.maxSizeInteger = 2;
    this.maxSize = Math.random() * 1.5 + 0.5;
    this.delay = delay;
    this.counter = 0;
    this.counterStep = Math.random() * 4 + (this.width + this.height) * 0.01;
    this.isIdle = false;
    this.isReverse = false;
    this.isShimmer = false;
  }

  draw() {
    const centerOffset = this.maxSizeInteger * 0.5 - this.size * 0.5;
    this.ctx.fillStyle = this.color;
    this.ctx.fillRect(this.x + centerOffset, this.y + centerOffset, this.size, this.size);
  }

  appear() {
    this.isIdle = false;
    if (this.counter <= this.delay) {
      this.counter += this.counterStep;
      return;
    }
    if (this.size >= this.maxSize) {
      this.isShimmer = true;
    }
    if (this.isShimmer) {
      this.shimmer();
    } else {
      this.size += this.sizeStep;
    }
    this.draw();
  }

  disappear() {
    this.isShimmer = false;
    this.counter = 0;
    if (this.size <= 0) {
      this.isIdle = true;
      return;
    } else {
      this.size -= 0.1;
    }
    this.draw();
  }

  shimmer() {
    if (this.size >= this.maxSize) {
      this.isReverse = true;
    } else if (this.size <= this.minSize) {
      this.isReverse = false;
    }
    if (this.isReverse) {
      this.size -= this.speed;
    } else {
      this.size += this.speed;
    }
  }
}

// React Bits Pixel Hover Canvas Effect
function PixelHoverEffect({ isHovered, active }) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const pixelsRef = useRef([]);
  const animationRef = useRef(null);
  const timePreviousRef = useRef(performance.now());

  const gap = 5;
  const speed = 0.035;
  const colors = active ? ['#3F3F46', '#27272A', '#18181B'] : ['#27272A', '#18181B', '#111114'];

  const initPixels = () => {
    if (!containerRef.current || !canvasRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const width = Math.floor(rect.width);
    const height = Math.floor(rect.height);
    if (width === 0 || height === 0) return;

    const ctx = canvasRef.current.getContext('2d');
    canvasRef.current.width = width;
    canvasRef.current.height = height;

    const pxs = [];
    for (let x = 0; x < width; x += gap) {
      for (let y = 0; y < height; y += gap) {
        const color = colors[Math.floor(Math.random() * colors.length)];
        const dx = x - width / 2;
        const dy = y - height / 2;
        const delay = Math.sqrt(dx * dx + dy * dy) * 0.08;
        pxs.push(new Pixel(canvasRef.current, ctx, x, y, color, speed, delay));
      }
    }
    pixelsRef.current = pxs;
  };

  const doAnimate = (fnName) => {
    animationRef.current = requestAnimationFrame(() => doAnimate(fnName));
    const timeNow = performance.now();
    const timePassed = timeNow - timePreviousRef.current;
    const timeInterval = 1000 / 60;
    if (timePassed < timeInterval) return;
    timePreviousRef.current = timeNow - (timePassed % timeInterval);

    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx || !canvasRef.current) return;

    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    let allIdle = true;
    for (let i = 0; i < pixelsRef.current.length; i++) {
      const pixel = pixelsRef.current[i];
      pixel[fnName]();
      if (!pixel.isIdle) allIdle = false;
    }
    if (allIdle) {
      cancelAnimationFrame(animationRef.current);
    }
  };

  useEffect(() => {
    initPixels();
  }, []);

  useEffect(() => {
    cancelAnimationFrame(animationRef.current);
    if (isHovered) {
      animationRef.current = requestAnimationFrame(() => doAnimate('appear'));
    } else {
      animationRef.current = requestAnimationFrame(() => doAnimate('disappear'));
    }
    return () => cancelAnimationFrame(animationRef.current);
  }, [isHovered]);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
        borderRadius: '8px',
        zIndex: 0
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          opacity: 0.65
        }}
      />
    </div>
  );
}

// User's Chess Engine Evaluation Matrices (directly from ChessAI.py)
const knightScores = [
  [-50, -40, -30, -30, -30, -30, -40, -50],
  [-40, -20, 0, 0, 0, 0, -20, -40],
  [-30, 0, 10, 15, 15, 10, 0, -30],
  [-30, 5, 15, 20, 20, 15, 5, -30],
  [-30, 0, 15, 20, 20, 15, 0, -30],
  [-30, 5, 10, 15, 15, 10, 5, -30],
  [-40, -20, 0, 5, 5, 0, -20, -40],
  [-50, -40, -30, -30, -30, -30, -40, -50]
];

const bishopScores = [
  [-20, -10, -10, -10, -10, -10, -10, -20],
  [-10, 0, 0, 0, 0, 0, 0, -10],
  [-10, 0, 5, 10, 10, 5, 0, -10],
  [-10, 5, 5, 10, 10, 5, 5, -10],
  [-10, 0, 10, 10, 10, 10, 0, -10],
  [-10, 10, 10, 10, 10, 10, 10, -10],
  [-10, 5, 0, 0, 0, 0, 5, -10],
  [-20, -10, -10, -10, -10, -10, -10, -20]
];

const rookScores = [
  [0, 0, 0, 0, 0, 0, 0, 0],
  [5, 10, 10, 10, 10, 10, 10, 5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [0, 0, 5, 5, 5, 5, 0, 0]
];

const queenScores = [
  [-20, -10, -10, -5, -5, -10, -10, -20],
  [-10, 0, 0, 0, 0, 0, 0, -10],
  [-10, 0, 5, 5, 5, 5, 0, -10],
  [-5, 0, 5, 5, 5, 5, 0, -5],
  [0, 0, 5, 5, 5, 5, 0, -5],
  [-10, 5, 5, 5, 5, 5, 0, -10],
  [-10, 0, 5, 0, 0, 0, 0, -10],
  [-20, -10, -10, -5, -5, -10, -10, -20]
];

const pawnScores = [
  [0, 0, 0, 0, 0, 0, 0, 0],
  [50, 50, 50, 50, 50, 50, 50, 50],
  [10, 10, 20, 30, 30, 20, 10, 10],
  [5, 5, 10, 25, 25, 10, 5, 5],
  [0, 0, 0, 20, 20, 0, 0, 0],
  [5, -5, -10, 0, 0, -10, -5, 5],
  [5, 10, 10, -20, -20, 10, 10, 5],
  [20, 20, 20, 20, 20, 20, 20, 20]
];

const kingScores = [
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-20, -30, -30, -40, -40, -30, -30, -20],
  [-10, -20, -20, -20, -20, -20, -20, -10],
  [20, 20, 0, 0, 0, 0, 20, 20],
  [20, 30, 10, 0, 0, 10, 30, 20]
];

const piecePositionScores = {
  wN: knightScores,
  bN: [...knightScores].reverse(),
  wB: bishopScores,
  bB: [...bishopScores].reverse(),
  wQ: queenScores,
  bQ: [...queenScores].reverse(),
  wR: rookScores,
  bR: [...rookScores].reverse(),
  wp: pawnScores,
  bp: [...pawnScores].reverse(),
  wK: kingScores,
  bK: [...kingScores].reverse()
};

const pieceValues = { p: 100, n: 300, b: 300, r: 500, q: 900, k: 20000 };
const POSITION_WEIGHT = 0.1;

// Chess AI Minimax Engine evaluation with User's Exact Piece-Square Table Heuristics
const evaluateBoard = (chess) => {
  if (chess.isCheckmate()) {
    return chess.turn() === 'w' ? -100000 : 100000;
  }
  if (chess.isDraw()) return 0;

  const board = chess.board();
  let totalEval = 0;

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (piece) {
        const val = pieceValues[piece.type] || 0;
        const pieceKey = piece.color + (piece.type === 'p' ? 'p' : piece.type.toUpperCase());
        const posScore = piecePositionScores[pieceKey] ? piecePositionScores[pieceKey][r][c] : 0;
        const pieceTotal = val + posScore * POSITION_WEIGHT;

        if (piece.color === 'w') {
          totalEval += pieceTotal;
        } else {
          totalEval -= pieceTotal;
        }
      }
    }
  }
  return totalEval;
};

const minimaxAB = (chess, depth, alpha, beta, isMaximizing) => {
  if (depth === 0 || chess.isGameOver()) {
    return evaluateBoard(chess);
  }

  const moves = chess.moves({ verbose: true });
  if (isMaximizing) {
    let maxEval = -Infinity;
    for (let i = 0; i < moves.length; i++) {
      chess.move(moves[i]);
      const evaluation = minimaxAB(chess, depth - 1, alpha, beta, false);
      chess.undo();
      maxEval = Math.max(maxEval, evaluation);
      alpha = Math.max(alpha, evaluation);
      if (beta <= alpha) break;
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (let i = 0; i < moves.length; i++) {
      chess.move(moves[i]);
      const evaluation = minimaxAB(chess, depth - 1, alpha, beta, true);
      chess.undo();
      minEval = Math.min(minEval, evaluation);
      beta = Math.min(beta, evaluation);
      if (beta <= alpha) break;
    }
    return minEval;
  }
};

const getAIMove = (chess, difficulty) => {
  const moves = chess.moves({ verbose: true });
  if (!moves.length) return null;

  let searchDepth = 1;
  let randomness = 0;

  if (difficulty === 'Beginner') {
    searchDepth = 1;
    randomness = 0.5;
  } else if (difficulty === 'Easy') {
    searchDepth = 1;
    randomness = 0.25;
  } else if (difficulty === 'Medium') {
    searchDepth = 2;
    randomness = 0.1;
  } else if (difficulty === 'Hard') {
    searchDepth = 3;
    randomness = 0.05;
  } else if (difficulty === 'Expert') {
    searchDepth = 3;
    randomness = 0;
  } else if (difficulty === 'Grandmaster') {
    searchDepth = 4;
    randomness = 0;
  }

  if (Math.random() < randomness && moves.length > 1) {
    return moves[Math.floor(Math.random() * moves.length)];
  }

  const isMaximizing = chess.turn() === 'w';
  let bestMove = moves[0];
  let bestValue = isMaximizing ? -Infinity : Infinity;

  for (let i = 0; i < moves.length; i++) {
    const move = moves[i];
    chess.move(move);
    const boardValue = minimaxAB(chess, searchDepth - 1, -Infinity, Infinity, !isMaximizing);
    chess.undo();

    if (isMaximizing) {
      if (boardValue > bestValue) {
        bestValue = boardValue;
        bestMove = move;
      }
    } else {
      if (boardValue < bestValue) {
        bestValue = boardValue;
        bestMove = move;
      }
    }
  }

  return bestMove;
};

// Sidebar Navigation Item with Subtle Pixel Hover & Smooth Hardware-Accelerated Transition
function SidebarNavItem({ tab, activeTab, isSidebarCollapsed, onClick, onHover }) {
  const [isHovered, setIsHovered] = useState(false);
  const Icon = tab.icon;
  const isActive = activeTab === tab.id;

  return (
    <button
      onClick={() => onClick(tab.id)}
      onMouseEnter={() => {
        setIsHovered(true);
        if (onHover) onHover(tab.id);
      }}
      onMouseLeave={() => {
        setIsHovered(false);
        if (onHover) onHover(null);
      }}
      title={isSidebarCollapsed ? tab.label : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-start',
        padding: '0.6rem 0.75rem',
        borderRadius: '8px',
        backgroundColor: isActive ? '#141416' : (isHovered ? '#0D0D0F' : 'transparent'),
        color: isActive ? '#FFFFFF' : (isHovered ? '#FFFFFF' : '#8E8E93'),
        border: isActive ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid transparent',
        fontWeight: isActive ? 700 : 600,
        fontSize: '0.85rem',
        cursor: 'pointer',
        transition: 'background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease',
        width: '100%',
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      <PixelHoverEffect isHovered={isHovered} active={isActive} />
      <span style={{
        position: 'relative',
        zIndex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-start',
        width: '100%'
      }}>
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, width: '20px' }}>
          <Icon size={18} />
        </span>
        <span style={{
          opacity: isSidebarCollapsed ? 0 : 1,
          maxWidth: isSidebarCollapsed ? '0px' : '140px',
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          marginLeft: isSidebarCollapsed ? '0px' : '0.75rem',
          transition: isSidebarCollapsed
            ? 'opacity 120ms ease, max-width 250ms cubic-bezier(0.4, 0, 0.2, 1), margin-left 250ms cubic-bezier(0.4, 0, 0.2, 1)'
            : 'opacity 180ms ease 40ms, max-width 250ms cubic-bezier(0.4, 0, 0.2, 1), margin-left 250ms cubic-bezier(0.4, 0, 0.2, 1)',
          pointerEvents: isSidebarCollapsed ? 'none' : 'auto'
        }}>
          {tab.label}
        </span>
      </span>
    </button>
  );
}

export default function DashboardScreen({ user, profile, onLogout, onRefreshProfile }) {
  const location = useLocation();
  const navigate = useNavigate();
  const getTabFromPath = (pathname) => {
    const path = (pathname || '').toLowerCase();
    if (path.startsWith('/play')) return 'play';
    if (path.startsWith('/puzzles')) return 'puzzles';
    if (path.startsWith('/learn')) return 'learn';
    if (path.startsWith('/books')) return 'books';
    if (path.startsWith('/news')) return 'news';
    if (path.startsWith('/leaderboard')) return 'leaderboard';
    if (path.startsWith('/profile')) return 'profile';
    if (path.startsWith('/settings')) return 'settings';
    return 'home';
  };

  const [activeTab, setActiveTab] = useState(() => getTabFromPath(location.pathname));

  // Sync activeTab and playSubMode when route URL path changes (e.g. browser back/forward or invite links)
  useEffect(() => {
    const targetTab = getTabFromPath(location.pathname);
    setActiveTab(targetTab);
    const searchParams = new URLSearchParams(location.search);
    if (searchParams.get('room') || searchParams.get('code') || location.pathname.includes('/friend')) {
      setActiveTab('play');
      setPlaySubMode('friend');
    }
  }, [location.pathname, location.search]);

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    const targetPath = tabId === 'home' ? '/dashboard' : `/${tabId}`;
    if (location.pathname !== targetPath) {
      navigate(targetPath);
    }
  };
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [showAnalyticsModal, setShowAnalyticsModal] = useState(false);
  const [showPuzzleModal, setShowPuzzleModal] = useState(false);
  const [puzzleSolved, setPuzzleSolved] = useState(false);

  // 1. Permanent Pure-Black Dark-Only Interface (Non-negotiable requirement)
  const isDarkMode = true;

  // 2. Notifications State
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(true);

  // Local profile state updated dynamically on game results and DB refreshes
  const [localProfile, setLocalProfile] = useState(null);
  const [recentRatingDelta, setRecentRatingDelta] = useState(null);
  const [companionContext, setCompanionContext] = useState(null);

  useEffect(() => {
    let mounted = true;
    if (user?.id) {
      supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()
        .then(({ data, error }) => {
          if (mounted && !error && data) {
            setLocalProfile(data);
          }
        })
        .catch(() => { });
    }
    return () => { mounted = false; };
  }, [user?.id]);

  useEffect(() => {
    if (profile) {
      setLocalProfile(profile);
    }
  }, [profile]);

  // User Profile Data: localProfile reflects dynamic post-match changes, falling back to top-level profile prop
  const effectiveProfile = localProfile || profile;
  const name = effectiveProfile?.full_name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Player';
  const skill = effectiveProfile?.skill_level || user?.user_metadata?.skill_level || 'Intermediate';
  const rating = typeof effectiveProfile?.rating === 'number'
    ? effectiveProfile.rating
    : (typeof user?.user_metadata?.rating === 'number'
      ? user.user_metadata.rating
      : (effectiveProfile ? null : 0));

  // Play Section Sub-Modes State ('main', 'online', 'friend', 'bot', 'match')
  const [playSubMode, setPlaySubMode] = useState(() => {
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get('room') || searchParams.get('code') || window.location.pathname.includes('/friend')) {
      return 'friend';
    }
    return 'main';
  });
  const [onlineTimeControl, setOnlineTimeControl] = useState('10min'); // '10min', '5min', '3min', '1min'
  const [isSearchingOnline, setIsSearchingOnline] = useState(false);
  const [botDifficulty, setBotDifficulty] = useState(skill || 'Intermediate');
  const [botSide, setBotSide] = useState('random'); // 'white', 'random', 'black'

  // Live AI Chess Game Match State
  const chessRef = useRef(new Chess());
  const [gameFen, setGameFen] = useState(chessRef.current.fen());
  const [userColor, setUserColor] = useState('w'); // 'w' or 'b'
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [legalSquares, setLegalSquares] = useState([]);
  const [lastMoveSquares, setLastMoveSquares] = useState([]);
  const [userTimeLeft, setUserTimeLeft] = useState(300); // 5 minutes in seconds
  const [aiTimeLeft, setAiTimeLeft] = useState(300);
  const [isAIThinking, setIsAIThinking] = useState(false);
  const [matchOutcome, setMatchOutcome] = useState(null); // { winner: 'user' | 'ai' | 'draw', title: string, reason: string }
  const [moveHistory, setMoveHistory] = useState([]);
  const [currentGameId, setCurrentGameId] = useState(null);
  const [gameMode, setGameMode] = useState('ai'); // 'ai' or 'online'
  const [opponentProfile, setOpponentProfile] = useState(null); // { id, name, rating, skillLevel }
  const [isConnectingWs, setIsConnectingWs] = useState(false);
  const [wsError, setWsError] = useState(null);

  // Online Match Reconnection & Grace Period States
  const [isReconnectingOnline, setIsReconnectingOnline] = useState(false);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [opponentDisconnectNotice, setOpponentDisconnectNotice] = useState(null);
  const [opponentGraceSecondsLeft, setOpponentGraceSecondsLeft] = useState(null);

  // Phase 8 Match History States
  const [matchHistory, setMatchHistory] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState(null);

  const loadMatchHistory = async () => {
    setIsLoadingHistory(true);
    setHistoryError(null);
    try {
      const token = await getValidSessionToken();
      if (!token) {
        setIsLoadingHistory(false);
        return;
      }
      const res = await getMatchHistory(token);
      if (res.success && res.data?.history) {
        setMatchHistory(res.data.history);
        if (recentRatingDelta === null && res.data.history.length > 0) {
          const latest = res.data.history[0];
          if (typeof latest.ratingDelta === 'number') {
            setRecentRatingDelta(latest.ratingDelta);
          }
        }
      } else {
        setHistoryError(res.error?.message || 'Failed to load match history.');
      }
    } catch (err) {
      setHistoryError(err.message || 'Error fetching match history.');
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    loadMatchHistory();
  }, []);

  useEffect(() => {
    if (activeTab === 'profile') {
      loadMatchHistory();
    }
  }, [activeTab]);

  // Bot Profile Info by Difficulty (Strictly named BOT with exact ELO ratings 0, 200, 500, 700, 1000)
  const getBotProfile = (diff) => {
    switch (diff) {
      case 'Grandmaster':
      case 'Expert':
        return { name: 'BOT', rating: 1000, avatar: '/images/bK.png', flag: '👑' };
      case 'Hard':
        return { name: 'BOT', rating: 700, avatar: '/images/bK.png', flag: '🔥' };
      case 'Medium':
        return { name: 'BOT', rating: 500, avatar: '/images/bN.png', flag: '🛡️' };
      case 'Easy':
        return { name: 'BOT', rating: 200, avatar: '/images/bp.png', flag: '🌱' };
      case 'Beginner':
      default:
        return { name: 'BOT', rating: 0, avatar: '/images/bp.png', flag: '🎯' };
    }
  };

  // Helper to format countdown timer
  const formatTimer = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // Start AI Match
  const startAIMatch = () => {
    setGameMode('ai');
    setCurrentGameId(null);
    setOpponentProfile(null);
    const newChess = new Chess();
    chessRef.current = newChess;
    setGameFen(newChess.fen());

    let chosenColor = 'w';
    if (botSide === 'white') chosenColor = 'w';
    else if (botSide === 'black') chosenColor = 'b';
    else chosenColor = Math.random() < 0.5 ? 'w' : 'b';

    setUserColor(chosenColor);
    setSelectedSquare(null);
    setLegalSquares([]);
    setLastMoveSquares([]);
    setUserTimeLeft(300);
    setAiTimeLeft(300);
    setIsAIThinking(false);
    setMatchOutcome(null);
    setMoveHistory([]);
    recordMatchPlayed();
    setPlaySubMode('match');

    // If User is Black, AI (White) moves first!
    if (chosenColor === 'b') {
      setIsAIThinking(true);
      setTimeout(() => {
        const aiMove = getAIMove(newChess, botDifficulty);
        if (aiMove) {
          newChess.move(aiMove);
          setGameFen(newChess.fen());
          setLastMoveSquares([aiMove.from, aiMove.to]);
          setMoveHistory([aiMove.san]);
        }
        setIsAIThinking(false);
      }, 600);
    }
  };

  // Square Click Handler
  const handleSquareClick = async (square) => {
    if (matchOutcome) return;
    const chess = chessRef.current;

    // Check turn based on current board position
    if (chess.turn() !== userColor) return;

    if (selectedSquare === square) {
      setSelectedSquare(null);
      setLegalSquares([]);
      return;
    }

    if (selectedSquare && legalSquares.includes(square)) {
      if (gameMode === 'online') {
        // --- ONLINE MATCH: SERVER-AUTHORITATIVE MOVE EXECUTION ---
        const fromSquare = selectedSquare;
        const toSquare = square;

        setSelectedSquare(null);
        setLegalSquares([]);

        try {
          const response = await gameSocket.send('game.move', {
            gameId: currentGameId,
            from: fromSquare,
            to: toSquare,
            promotion: 'q' // Default promotion piece safety
          });

          if (response && response.payload?.state) {
            const { move, state } = response.payload;

            // Sync board strictly from server-authoritative state
            chessRef.current = new Chess(state.fen);
            setGameFen(state.fen);

            if (move?.lan && move.lan.length >= 4) {
              setLastMoveSquares([move.lan.slice(0, 2), move.lan.slice(2, 4)]);
            }
            if (move?.san) {
              setMoveHistory((prev) => (prev[prev.length - 1] === move.san ? prev : [...prev, move.san]));
            }

            if (state.clocks) {
              setUserTimeLeft(userColor === 'w' ? state.clocks.whiteTimeLeft : state.clocks.blackTimeLeft);
              setAiTimeLeft(userColor === 'w' ? state.clocks.blackTimeLeft : state.clocks.whiteTimeLeft);
            }

            if (state.status === 'completed') {
              let outcomeTitle = 'GAME OVER 🏁';
              let outcomeReason = state.resultReason || 'Game completed.';
              let winner = 'draw';

              if (state.result === 'white_win') {
                winner = userColor === 'w' ? 'user' : 'ai';
                outcomeTitle = userColor === 'w' ? 'VICTORY! 🏆' : 'DEFEAT 💔';
              } else if (state.result === 'black_win') {
                winner = userColor === 'b' ? 'user' : 'ai';
                outcomeTitle = userColor === 'b' ? 'VICTORY! 🏆' : 'DEFEAT 💔';
              }

              setMatchOutcome({ winner, title: outcomeTitle, reason: outcomeReason });
            }
          }
        } catch (err) {
          console.warn('Server rejected move:', err.message);
          // Restore authoritative board state from server-synced instance
          setGameFen(chessRef.current.fen());
          alert(`Move Rejected: ${err.message || 'Invalid move'}`);
        }
        return;
      } else {
        // --- OFFLINE / AI MATCH MOVE EXECUTION (UNTOUCHED) ---
        if (isAIThinking) return;
        try {
          const move = chess.move({
            from: selectedSquare,
            to: square,
            promotion: 'q'
          });

          if (move) {
            setGameFen(chess.fen());
            setLastMoveSquares([move.from, move.to]);
            setMoveHistory((prev) => [...prev, move.san]);
            setSelectedSquare(null);
            setLegalSquares([]);

            if (chess.isGameOver()) {
              handleGameOver(chess, userColor);
              return;
            }

            setIsAIThinking(true);
            setTimeout(() => {
              if (chess.isGameOver()) {
                setIsAIThinking(false);
                handleGameOver(chess, userColor);
                return;
              }
              const aiMove = getAIMove(chess, botDifficulty);
              if (aiMove) {
                chess.move(aiMove);
                setGameFen(chess.fen());
                setLastMoveSquares([aiMove.from, aiMove.to]);
                setMoveHistory((prev) => [...prev, aiMove.san]);

                if (chess.isGameOver()) {
                  handleGameOver(chess, userColor);
                }
              }
              setIsAIThinking(false);
            }, 500);
            return;
          }
        } catch (err) {
          // Fallback
        }
      }
    }

    const piece = chess.get(square);
    if (piece && piece.color === userColor) {
      setSelectedSquare(square);
      const moves = chess.moves({ square, verbose: true });
      setLegalSquares(moves.map((m) => m.to));
    } else {
      setSelectedSquare(null);
      setLegalSquares([]);
    }
  };

  // Game Over Checker
  const handleGameOver = (chess, uColor) => {
    if (chess.isCheckmate()) {
      const winnerColor = chess.turn() === 'w' ? 'b' : 'w';
      if (winnerColor === uColor) {
        setMatchOutcome({ winner: 'user', title: 'VICTORY BY CHECKMATE! 🏆', reason: 'You checkmated the AI engine.' });
      } else {
        setMatchOutcome({ winner: 'ai', title: 'DEFEAT BY CHECKMATE 💔', reason: 'The AI engine checkmated your King.' });
      }
    } else if (chess.isStalemate()) {
      setMatchOutcome({ winner: 'draw', title: 'DRAW BY STALEMATE 🤝', reason: 'No legal moves available.' });
    } else if (chess.isThreefoldRepetition()) {
      setMatchOutcome({ winner: 'draw', title: 'DRAW BY REPETITION 🤝', reason: 'Position repeated 3 times.' });
    } else if (chess.isInsufficientMaterial()) {
      setMatchOutcome({ winner: 'draw', title: 'DRAW BY INSUFFICIENT MATERIAL 🤝', reason: 'Not enough material left to checkmate.' });
    } else if (chess.isDraw()) {
      setMatchOutcome({ winner: 'draw', title: 'MATCH DRAWN 🤝', reason: 'Game ended in a draw.' });
    }
  };

  // Undo Move
  const handleUndoMove = () => {
    if (matchOutcome || isAIThinking || gameMode === 'online') return;
    const chess = chessRef.current;
    if (chess.history().length >= 2) {
      chess.undo();
      chess.undo();
    } else if (chess.history().length === 1 && chess.turn() !== userColor) {
      chess.undo();
    }
    setGameFen(chess.fen());
    setSelectedSquare(null);
    setLegalSquares([]);
    setLastMoveSquares([]);
  };

  // Resign Match
  const handleResign = async () => {
    if (matchOutcome) return;
    if (window.confirm('Are you sure you want to resign this match?')) {
      if (gameMode === 'online' && currentGameId) {
        try {
          await gameSocket.send('game.resign', { gameId: currentGameId });
        } catch (err) {
          console.warn('Resign error:', err.message);
        }
      } else {
        setMatchOutcome({ winner: 'ai', title: 'MATCH RESIGNED 🏳️', reason: 'You forfeited the game.' });
      }
    }
  };

  // WebSocket Server Broadcast Listener for Online Match Updates
  useEffect(() => {
    if (gameMode !== 'online' || playSubMode !== 'match' || !currentGameId) {
      return;
    }

    const handleServerGameState = (data) => {
      const state = data.payload?.state;
      const move = data.payload?.move;

      if (!state) return;
      if (state.gameId && state.gameId !== currentGameId) return;

      // Sync position from server-authoritative FEN
      if (state.fen) {
        chessRef.current = new Chess(state.fen);
        setGameFen(state.fen);
      }

      if (move) {
        if (move.lan && move.lan.length >= 4) {
          setLastMoveSquares([move.lan.slice(0, 2), move.lan.slice(2, 4)]);
        }
        if (move.san) {
          setMoveHistory((prev) => (prev[prev.length - 1] === move.san ? prev : [...prev, move.san]));
        }
      }

      if (state.clocks) {
        setUserTimeLeft(userColor === 'w' ? state.clocks.whiteTimeLeft : state.clocks.blackTimeLeft);
        setAiTimeLeft(userColor === 'w' ? state.clocks.blackTimeLeft : state.clocks.whiteTimeLeft);
      }

      if (state.status === 'completed') {
        sessionStorage.removeItem('strategic_chess_active_match');
        setOpponentDisconnectNotice(null);
        setIsReconnectingOnline(false);

        let outcomeTitle = 'GAME OVER 🏁';
        let outcomeReason = state.resultReason || 'Game completed.';
        let winner = 'draw';

        if (state.result === 'white_win') {
          winner = userColor === 'w' ? 'user' : 'ai';
          outcomeTitle = userColor === 'w' ? 'VICTORY! 🏆' : 'DEFEAT 💔';
        } else if (state.result === 'black_win') {
          winner = userColor === 'b' ? 'user' : 'ai';
          outcomeTitle = userColor === 'b' ? 'VICTORY! 🏆' : 'DEFEAT 💔';
        }

        const ratingChanges = state.ratingChanges || data?.payload?.ratingChanges || null;
        let ratingDelta = null;
        let newRating = null;
        if (ratingChanges) {
          if (userColor === 'w') {
            ratingDelta = ratingChanges.whiteDelta;
            newRating = ratingChanges.whiteNewRating;
          } else {
            ratingDelta = ratingChanges.blackDelta;
            newRating = ratingChanges.blackNewRating;
          }
        }

        if (typeof ratingDelta === 'number') {
          setRecentRatingDelta(ratingDelta);
        }

        if (typeof newRating === 'number') {
          setLocalProfile((prev) => ({
            ...(prev || profile || {}),
            rating: newRating
          }));
        }

        setMatchOutcome({
          winner,
          title: outcomeTitle,
          reason: outcomeReason,
          ratingDelta,
          newRating
        });

        // Trigger immediate profile refresh to update dashboard stats and progress from database
        if (user?.id) {
          supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single()
            .then(({ data: updatedProf }) => {
              if (updatedProf && typeof updatedProf.rating === 'number') {
                setLocalProfile(updatedProf);
                if (typeof onRefreshProfile === 'function') {
                  onRefreshProfile();
                }
              }
            })
            .catch(() => { });
        }
      }
    };

    const unsubscribeMove = gameSocket.on('game.move', handleServerGameState);
    const unsubscribeState = gameSocket.on('game.state', handleServerGameState);
    const unsubscribeEnded = gameSocket.on('game.ended', handleServerGameState);

    return () => {
      unsubscribeMove();
      unsubscribeState();
      unsubscribeEnded();
    };
  }, [gameMode, playSubMode, currentGameId, userColor]);

  // Live Timer Countdown Effect (Smooth 1s ticking resynced on server broadcasts)
  useEffect(() => {
    if (playSubMode !== 'match' || matchOutcome) return;

    const interval = setInterval(() => {
      const currentTurn = chessRef.current.turn();
      if (currentTurn === userColor) {
        setUserTimeLeft((prev) => {
          if (prev <= 1) {
            // For offline AI match, client ends game on timeout; for online match, authoritative server ends it
            if (gameMode !== 'online') {
              setMatchOutcome({ winner: 'ai', title: 'DEFEAT BY TIMEOUT ⏳', reason: 'Your time ran out.' });
            }
            return 0;
          }
          return prev - 1;
        });
      } else {
        setAiTimeLeft((prev) => {
          if (prev <= 1) {
            if (gameMode !== 'online') {
              setMatchOutcome({ winner: 'user', title: 'VICTORY BY TIMEOUT 🏆', reason: 'The AI time ran out.' });
            }
            return 0;
          }
          return prev - 1;
        });
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [playSubMode, matchOutcome, userColor, gameFen, gameMode]);

  // Captured Pieces Calculation
  const getCapturedPieces = () => {
    const board = chessRef.current.board();
    const currentCounts = { w: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 } };
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = board[r][c];
        if (piece) {
          currentCounts[piece.color][piece.type]++;
        }
      }
    }
    const initialCounts = { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 };
    const pieceValues = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

    const capturedWhite = [];
    const capturedBlack = [];
    let whiteMaterial = 0;
    let blackMaterial = 0;

    ['p', 'n', 'b', 'r', 'q'].forEach((type) => {
      const missingWhite = initialCounts[type] - currentCounts.w[type];
      for (let i = 0; i < missingWhite; i++) capturedWhite.push(type);

      const missingBlack = initialCounts[type] - currentCounts.b[type];
      for (let i = 0; i < missingBlack; i++) capturedBlack.push(type);
    });

    ['p', 'n', 'b', 'r', 'q'].forEach((type) => {
      whiteMaterial += currentCounts.w[type] * pieceValues[type];
      blackMaterial += currentCounts.b[type] * pieceValues[type];
    });

    return {
      capturedWhite,
      capturedBlack,
      materialDiff: whiteMaterial - blackMaterial
    };
  };

  // Calculate Rank Title based on 200-point ELO intervals:
  // Bronze: 0–199, Silver: 200–399, Gold: 400–599, Diamond: 600–799, Mythic: 800–999, Legendary: 1000–1199, Grandmaster: 1200–1399
  const getRankInfo = (elo) => {
    if (elo >= 1200) return { title: 'GRANDMASTER', minElo: 1200, nextElo: 1400, color: '#EAB308', piece: '/Black_King_clean.png' };
    if (elo >= 1000) return { title: 'LEGENDARY', minElo: 1000, nextElo: 1200, color: '#F59E0B', piece: '/Black_King_clean.png' };
    if (elo >= 800) return { title: 'MYTHIC', minElo: 800, nextElo: 1000, color: '#8B5CF6', piece: '/experience_king.jpg' };
    if (elo >= 600) return { title: 'DIAMOND', minElo: 600, nextElo: 800, color: '#3B82F6', piece: '/experience_knight.jpg' };
    if (elo >= 400) return { title: 'GOLD', minElo: 400, nextElo: 600, color: '#EAB308', piece: '/Black_Knight.jpg' };
    if (elo >= 200) return { title: 'SILVER', minElo: 200, nextElo: 400, color: '#9CA3AF', piece: '/Black_pawn_clean.png' };
    return { title: 'BRONZE', minElo: 0, nextElo: 200, color: '#CD7F32', piece: '/Black_pawn_clean.png' };
  };

  const rankInfo = getRankInfo(rating);
  const progressPercent = Math.min(100, Math.max(0, ((rating - rankInfo.minElo) / (rankInfo.nextElo - rankInfo.minElo)) * 100));

  const mockNotifications = [
    {
      id: 1,
      sender: 'System Admin',
      avatar: '/pixel_avatar.jpg',
      title: 'Welcome to Strategic Chess',
      message: 'Explore your daily dashboard, train pattern recognition with puzzles, and challenge our Python AI engine.',
      time: '10m ago',
      unread: true
    },
    {
      id: 2,
      sender: 'Grandmaster Bot',
      avatar: '/Black_King_clean.png',
      title: 'Daily Puzzle Recommendation',
      message: 'Today\'s tactic puzzle "Checkmate in 2 Moves" is live. Solve it to earn +15 ELO.',
      time: '2h ago',
      unread: true
    },
    {
      id: 3,
      sender: 'Rating System',
      avatar: '/experience_king.jpg',
      title: 'Tier Progress Update',
      message: `You are in the top 15% of players in the ${rankInfo.title} tier. Maintain your daily streak to reach GM.`,
      time: '1d ago',
      unread: false
    }
  ];

  // 3. Persistent Daily Streak State & Midnight Reset Calculation
  const userId = user?.id || user?.email || 'default_user';

  // 4. Played Matches Dates array from localStorage for Activity Calendar
  const [playedDates, setPlayedDates] = useState(() => {
    const saved = localStorage.getItem(`chess_played_dates_${userId}`);
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { return []; }
    }
    return [];
  });

  const [streakData, setStreakData] = useState(() => {
    const todayStr = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
    const saved = localStorage.getItem(`chess_streak_${userId}`);
    if (!saved) {
      return { count: 0, lastMatchDate: null, fireActive: false };
    }
    try {
      const data = JSON.parse(saved);
      if (!data.lastMatchDate) {
        return { count: 0, lastMatchDate: null, fireActive: false };
      }

      const lastDate = new Date(data.lastMatchDate + 'T00:00:00');
      const todayDate = new Date(todayStr + 'T00:00:00');
      const diffTime = todayDate.getTime() - lastDate.getTime();
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays === 0) {
        return { count: data.count, lastMatchDate: data.lastMatchDate, fireActive: data.fireActive ?? true };
      } else if (diffDays === 1) {
        return { count: data.count, lastMatchDate: data.lastMatchDate, fireActive: false };
      } else {
        return { count: 0, lastMatchDate: data.lastMatchDate, fireActive: false };
      }
    } catch (e) {
      return { count: 0, lastMatchDate: null, fireActive: false };
    }
  });

  // Action: Trigger when user plays a match
  const recordMatchPlayed = () => {
    const todayStr = new Date().toLocaleDateString('en-CA');
    setPlayedDates((prev) => {
      if (!prev.includes(todayStr)) {
        const updated = [...prev, todayStr];
        localStorage.setItem(`chess_played_dates_${userId}`, JSON.stringify(updated));
        return updated;
      }
      return prev;
    });

    setStreakData((prev) => {
      if (prev.lastMatchDate === todayStr && prev.fireActive) {
        return prev;
      }

      let newCount = prev.count;
      if (prev.lastMatchDate) {
        const lastDate = new Date(prev.lastMatchDate + 'T00:00:00');
        const todayDate = new Date(todayStr + 'T00:00:00');
        const diffDays = Math.round((todayDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));

        if (diffDays === 1) {
          newCount = prev.count + 1;
        } else if (diffDays === 0) {
          newCount = prev.count === 0 ? 1 : prev.count;
        } else {
          newCount = 1;
        }
      } else {
        newCount = 1;
      }

      const updated = { count: newCount, lastMatchDate: todayStr, fireActive: true };
      localStorage.setItem(`chess_streak_${userId}`, JSON.stringify(updated));
      return updated;
    });
  };

  // Handle Server Matchmaking Result (Step 4F-C)
  const handleGameMatched = (payload) => {
    const { gameId, assignedColor, state, opponent } = payload;
    if (!gameId || !state) return;

    setCurrentGameId(gameId);
    setGameMode('online');
    if (opponent) {
      setOpponentProfile(opponent);
    }
    setIsSearchingOnline(false);
    setIsConnectingWs(false);

    // Server-authoritative initial state
    const serverFen = state.fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const newChess = new Chess(serverFen);
    chessRef.current = newChess;
    setGameFen(newChess.fen());

    setUserColor(assignedColor || 'w');

    setSelectedSquare(null);
    setLegalSquares([]);
    setLastMoveSquares([]);
    setMatchOutcome(null);
    setMoveHistory([]);

    if (state.clocks) {
      setUserTimeLeft(assignedColor === 'w' ? state.clocks.whiteTimeLeft : state.clocks.blackTimeLeft);
      setAiTimeLeft(assignedColor === 'w' ? state.clocks.blackTimeLeft : state.clocks.whiteTimeLeft);
    }

    // Persist active match session for resilient reconnection on refresh/network drop
    sessionStorage.setItem('strategic_chess_active_match', JSON.stringify({
      gameId,
      assignedColor,
      opponent
    }));

    recordMatchPlayed();
    setPlaySubMode('match');
  };

  // Authenticated Match Reconnection Flow
  const reconnectToOnlineMatch = async (targetGameId, cachedInfo = null) => {
    if (!targetGameId) return false;
    setIsReconnectingOnline(true);
    setReconnectAttempt((prev) => prev + 1);

    try {
      const token = await getValidSessionToken();
      await gameSocket.connect(token);

      const response = await gameSocket.send('game.reconnect', { gameId: targetGameId });
      if (response && response.type === 'game.reconnected' && response.payload) {
        const { gameId, assignedColor, state, opponent, moveHistory: moves } = response.payload;
        setCurrentGameId(gameId);
        setGameMode('online');
        setUserColor(assignedColor || 'w');

        if (opponent || cachedInfo?.opponent) {
          setOpponentProfile(opponent || cachedInfo?.opponent);
        }

        const serverFen = state.fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
        const newChess = new Chess(serverFen);
        chessRef.current = newChess;
        setGameFen(newChess.fen());

        setSelectedSquare(null);
        setLegalSquares([]);
        setMatchOutcome(null);

        if (state.lastMove && state.lastMove.lan && state.lastMove.lan.length >= 4) {
          setLastMoveSquares([state.lastMove.lan.slice(0, 2), state.lastMove.lan.slice(2, 4)]);
        }

        if (moves && Array.isArray(moves)) {
          setMoveHistory(moves.map((m) => m.san));
        } else if (state.moveHistory && Array.isArray(state.moveHistory)) {
          setMoveHistory(state.moveHistory.map((m) => m.san));
        }

        if (state.clocks) {
          setUserTimeLeft(assignedColor === 'w' ? state.clocks.whiteTimeLeft : state.clocks.blackTimeLeft);
          setAiTimeLeft(assignedColor === 'w' ? state.clocks.blackTimeLeft : state.clocks.whiteTimeLeft);
        }

        const myUserId = profile?.id || localProfile?.id;
        if (state.isGraceActive && state.disconnectedPlayerId && state.disconnectedPlayerId !== myUserId) {
          setOpponentDisconnectNotice({
            expiresAt: state.disconnectGraceExpiresAt,
            totalSeconds: 45,
            opponentId: state.disconnectedPlayerId
          });
        } else {
          setOpponentDisconnectNotice(null);
        }

        setPlaySubMode('match');
        setIsReconnectingOnline(false);
        setReconnectAttempt(0);
        return true;
      }
    } catch (err) {
      console.warn('Online reconnection attempt notice:', err.message);
      const errLower = err.message.toLowerCase();
      if (errLower.includes('ended') || errLower.includes('finished') || errLower.includes('not found') || errLower.includes('not a player')) {
        sessionStorage.removeItem('strategic_chess_active_match');
        setIsReconnectingOnline(false);
        setReconnectAttempt(0);
      }
    }
    return false;
  };

  // Start Authoritative Online Matchmaking (Step 4F-C)
  const startOnlineMatch = async () => {
    setWsError(null);
    setIsConnectingWs(true);

    try {
      // 1. Obtain a valid, current Supabase access token (handling refresh explicitly)
      let token = await getValidSessionToken();

      // 2. Connect to backend WebSocket (/ws?token=<access_token>)
      try {
        await gameSocket.connect(token);
      } catch (connErr) {
        // If connection fails due to token authentication failure, force session refresh and retry once
        const errMsg = connErr.message?.toLowerCase() || '';
        if (errMsg.includes('invalid or expired') || errMsg.includes('authentication') || errMsg.includes('unauthorized') || errMsg.includes('token')) {
          const { data: refreshData, error: refreshErr } = await supabase.auth.refreshSession();
          if (refreshErr || !refreshData?.session?.access_token) {
            throw new Error('Invalid or expired authentication token. Please sign in again.');
          }
          token = refreshData.session.access_token;
          await gameSocket.connect(token);
        } else {
          throw connErr;
        }
      }

      // 3. Send game.matchmake protocol message to authoritative server
      const response = await gameSocket.send('game.matchmake', {
        gameType: 'casual',
        timeControl: onlineTimeControl
      });

      if (response && response.type === 'game.queued') {
        // Player entered matchmaking queue; waiting for opponent
        setIsSearchingOnline(true);
        setIsConnectingWs(false);
      } else if (response && response.type === 'game.matched' && response.payload) {
        // Immediate match
        handleGameMatched(response.payload);
      }
    } catch (err) {
      console.error('Failed to start online matchmaking:', err);
      setWsError(err.message || 'Failed to connect to matchmaking server.');
      alert(`Online Match Error: ${err.message || 'Could not connect to game server.'}`);
      setIsSearchingOnline(false);
      setIsConnectingWs(false);
    }
  };

  // Cancel Online Matchmaking (Step 4F-C)
  const cancelOnlineMatchmaking = async () => {
    try {
      if (gameSocket.isConnected) {
        await gameSocket.send('game.matchmake_cancel', {});
      }
    } catch (err) {
      console.warn('Cancel matchmaking notice:', err.message);
    } finally {
      setIsSearchingOnline(false);
      setIsConnectingWs(false);
    }
  };

  // Auto-restore active match from sessionStorage on page mount/refresh
  useEffect(() => {
    const savedMatchStr = sessionStorage.getItem('strategic_chess_active_match');
    if (!savedMatchStr) return;

    let savedMatch = null;
    try {
      savedMatch = JSON.parse(savedMatchStr);
    } catch (e) {
      sessionStorage.removeItem('strategic_chess_active_match');
      return;
    }

    if (!savedMatch || !savedMatch.gameId) return;

    reconnectToOnlineMatch(savedMatch.gameId, savedMatch);
  }, []);

  // Opponent disconnect countdown timer tick
  useEffect(() => {
    if (!opponentDisconnectNotice || !opponentDisconnectNotice.expiresAt) {
      setOpponentGraceSecondsLeft(null);
      return;
    }

    const updateGrace = () => {
      const msLeft = opponentDisconnectNotice.expiresAt - Date.now();
      const secLeft = Math.max(0, Math.ceil(msLeft / 1000));
      setOpponentGraceSecondsLeft(secLeft);
      if (secLeft <= 0) {
        setOpponentDisconnectNotice(null);
      }
    };

    updateGrace();
    const interval = setInterval(updateGrace, 1000);
    return () => clearInterval(interval);
  }, [opponentDisconnectNotice]);

  // Listen for opponent disconnection and reconnection events
  useEffect(() => {
    const myUserId = profile?.id || localProfile?.id;

    const unsubDisconnect = gameSocket.on('game.player_disconnected', (data) => {
      if (data.payload && data.payload.userId !== myUserId) {
        setOpponentDisconnectNotice({
          expiresAt: data.payload.disconnectGraceExpiresAt,
          totalSeconds: data.payload.gracePeriodSeconds || 45,
          opponentId: data.payload.userId
        });
      }
    });

    const unsubReconnect = gameSocket.on('game.player_reconnected', (data) => {
      if (data.payload && data.payload.userId !== myUserId) {
        setOpponentDisconnectNotice(null);
      }
    });

    return () => {
      unsubDisconnect();
      unsubReconnect();
    };
  }, [profile?.id, localProfile?.id]);

  // Auto-reconnect with bounded backoff if connection drops unexpectedly during active match
  useEffect(() => {
    let reconnectTimeout = null;

    const unsubClose = gameSocket.on('close', () => {
      if (gameMode === 'online' && playSubMode === 'match' && currentGameId && !matchOutcome) {
        setIsReconnectingOnline(true);
        let attempt = 0;
        const maxAttempts = 6;

        const scheduleRetry = () => {
          if (attempt >= maxAttempts) {
            setIsReconnectingOnline(false);
            return;
          }
          attempt++;
          setReconnectAttempt(attempt);
          const delay = Math.min(1000 * Math.pow(1.5, attempt - 1), 5000);
          reconnectTimeout = setTimeout(async () => {
            if (gameMode !== 'online' || playSubMode !== 'match' || !currentGameId) return;
            const success = await reconnectToOnlineMatch(currentGameId);
            if (!success && attempt < maxAttempts) {
              scheduleRetry();
            }
          }, delay);
        };

        scheduleRetry();
      }
    });

    return () => {
      unsubClose();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, [gameMode, playSubMode, currentGameId, matchOutcome]);

  // WebSocket Server Broadcast Listener for Matchmaking Matches (Step 4F-C)
  useEffect(() => {
    const unsubscribeMatched = gameSocket.on('game.matched', (data) => {
      if (data.payload) {
        handleGameMatched(data.payload);
      }
    });

    return () => {
      unsubscribeMatched();
    };
  }, []);

  useEffect(() => {
    return () => {
      gameSocket.disconnect();
    };
  }, []);

  // Dynamic Time Greeting
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 18) return 'Good Afternoon';
    return 'Good Evening';
  };

  // Live Formatted Date
  const today = new Date();
  const dayNum = String(today.getDate()).padStart(2, '0');
  const monthName = today.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
  const weekDay = today.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();

  // Activity Calendar Helper Calculations
  const currentMonthDate = new Date();
  const currentYear = currentMonthDate.getFullYear();
  const currentMonth = currentMonthDate.getMonth();
  const currentDay = currentMonthDate.getDate();
  const currentMonthName = currentMonthDate.toLocaleDateString('en-US', { month: 'long' }).toUpperCase();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(currentYear, currentMonth, 1).getDay();
  const weekDayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  const isMatchActive = activeTab === 'play' && playSubMode === 'match';

  return (
    <div style={{
      width: '100vw',
      height: isMatchActive ? '100vh' : 'auto',
      minHeight: '100dvh',
      backgroundColor: '#000000',
      color: '#FFFFFF',
      fontFamily: "'Outfit', -apple-system, BlinkMacSystemFont, sans-serif",
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
      overflow: isMatchActive ? 'hidden' : 'auto',
      overflowX: 'hidden'
    }}>

      {/* TOP DESKTOP HEADER (Pure Black Vantablack Aesthetic with Subtle Divider - Hidden during active match) */}
      {!isMatchActive && (
        <header className="dash-desktop-flex" style={{
          height: '56px',
          backgroundColor: '#000000',
          borderBottom: '1px solid #141416',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 1.25rem',
          position: 'sticky',
          top: 0,
          zIndex: 70,
          boxSizing: 'border-box'
        }}>
          {/* LEFT: Menu button & Brand Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <button
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            title={isSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              backgroundColor: '#0A0A0D',
              border: '1px solid #1A1A1D',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: 0,
              transition: 'all 0.15s ease'
            }}
          >
            <Menu size={18} />
          </button>

          <div
            onClick={() => handleTabChange('home')}
            title="Go to Dashboard"
            style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', cursor: 'pointer' }}
          >
            <img
              src="/official_logo.png"
              alt="Strategic Chess Logo"
              style={{ width: '30px', height: '30px', borderRadius: '6px', objectFit: 'contain', flexShrink: 0 }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.05 }}>
              <span style={{ fontSize: '0.88rem', fontWeight: 900, letterSpacing: '1.5px', color: '#FFFFFF' }}>STRATEGIC</span>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '2px', color: '#A1A1AA' }}>CHESS</span>
            </div>
          </div>
        </div>

        {/* RIGHT: ACTION BUTTONS (Daily Streak & Notifications — Theme Toggle removed for permanent dark design) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', position: 'relative' }}>

          {/* C. DAILY STREAK BUTTON */}
          <div
            title={streakData.fireActive ? `Daily Streak Active: ${streakData.count} Day(s)!` : `Daily Streak Inactive. Play 1 match to activate!`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              padding: '0.45rem 0.75rem',
              borderRadius: '8px',
              backgroundColor: streakData.fireActive
                ? 'rgba(249, 115, 22, 0.14)'
                : '#0A0A0D',
              border: streakData.fireActive
                ? '1px solid rgba(249, 115, 22, 0.35)'
                : '1px solid #1A1A1D',
              color: streakData.fireActive
                ? '#F97316'
                : '#A1A1AA',
              fontSize: '0.85rem',
              fontWeight: 800,
              userSelect: 'none',
              transition: 'all 0.25s ease'
            }}
          >
            <motion.div
              animate={streakData.fireActive ? { scale: [1, 1.15, 1] } : { scale: 1 }}
              transition={{ repeat: streakData.fireActive ? Infinity : 0, repeatDelay: 2.5, duration: 0.6 }}
            >
              <Flame
                size={18}
                fill={streakData.fireActive ? '#F97316' : 'transparent'}
                color={streakData.fireActive ? '#EA580C' : '#71717A'}
              />
            </motion.div>
            <span>{streakData.count}</span>
          </div>

          {/* B. NOTIFICATIONS BUTTON & PANEL DROPDOWN */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => {
                setShowNotifications(!showNotifications);
                if (unreadNotifications) setUnreadNotifications(false);
              }}
              title="Notifications"
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                backgroundColor: '#0A0A0D',
                border: '1px solid #1A1A1D',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                position: 'relative',
                transition: 'all 0.15s ease'
              }}
            >
              <Bell size={18} />
              {unreadNotifications && (
                <span style={{
                  position: 'absolute',
                  top: '7px',
                  right: '7px',
                  width: '7px',
                  height: '7px',
                  backgroundColor: '#10B981',
                  borderRadius: '50%',
                  boxShadow: '0 0 0 2px #000000'
                }} />
              )}
            </button>

            {/* NOTIFICATIONS PANEL DROPDOWN */}
            <AnimatePresence>
              {showNotifications && (
                <>
                  {/* Backdrop to close panel when clicking outside */}
                  <div
                    onClick={() => setShowNotifications(false)}
                    style={{ position: 'fixed', inset: 0, zIndex: 99 }}
                  />

                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 6, scale: 0.96 }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: '46px',
                      width: '340px',
                      backgroundColor: '#08080A',
                      border: '1px solid #1A1A1D',
                      borderRadius: '16px',
                      boxShadow: '0 16px 36px rgba(0,0,0,0.6)',
                      zIndex: 100,
                      overflow: 'hidden',
                      color: '#FFFFFF'
                    }}
                  >
                    {/* Header */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.9rem 1.1rem',
                      borderBottom: '1px solid #141416'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Bell size={16} />
                        <span style={{ fontWeight: 800, fontSize: '0.9rem' }}>Notifications</span>
                      </div>
                      <button
                        onClick={() => setShowNotifications(false)}
                        style={{ background: 'none', border: 'none', color: '#A1A1AA', cursor: 'pointer' }}
                      >
                        <X size={16} />
                      </button>
                    </div>

                    {/* Messages List */}
                    <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
                      {mockNotifications.map((notif) => (
                        <div
                          key={notif.id}
                          style={{
                            padding: '0.85rem 1.1rem',
                            borderBottom: '1px solid #141416',
                            display: 'flex',
                            gap: '0.75rem',
                            backgroundColor: notif.unread ? '#111114' : 'transparent',
                            transition: 'background-color 0.15s ease'
                          }}
                        >
                          <img
                            src={notif.avatar}
                            alt="Avatar"
                            style={{ width: '32px', height: '32px', borderRadius: '6px', objectFit: 'cover', flexShrink: 0 }}
                          />
                          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontWeight: 700, fontSize: '0.82rem', color: '#FFFFFF' }}>{notif.title}</span>
                              <span style={{ fontSize: '0.68rem', color: '#A1A1AA' }}>{notif.time}</span>
                            </div>
                            <p style={{ fontSize: '0.78rem', color: '#D4D4D8', margin: 0, lineHeight: 1.35 }}>
                              {notif.message}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

        </div>
      </header>
      )}

      {/* MAIN APPLICATION BODY BELOW TOP HEADER */}
      <div style={{
        display: 'flex',
        flex: 1,
        minHeight: isMatchActive ? '100vh' : 'calc(100vh - 56px)',
        height: isMatchActive ? '100vh' : 'auto',
        overflow: isMatchActive ? 'hidden' : 'visible'
      }}>
        {/* FIXED DESKTOP LEFT SIDEBAR (Hidden during active match) */}
        {!isMatchActive && (
          <aside className="dash-desktop-flex" style={{
            width: isSidebarCollapsed ? '72px' : '230px',
            minWidth: isSidebarCollapsed ? '72px' : '230px',
          height: 'calc(100vh - 56px)',
          position: 'sticky',
          top: '56px',
          backgroundColor: '#000000',
          borderRight: '1px solid #141416',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '1.25rem 0.75rem',
          transition: 'width 250ms cubic-bezier(0.4, 0, 0.2, 1), min-width 250ms cubic-bezier(0.4, 0, 0.2, 1)',
          willChange: 'width, min-width',
          zIndex: 60,
          boxSizing: 'border-box'
        }}>
          {/* MAIN NAVIGATION ITEMS (1 to 7) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>

            {/* MAIN NAVIGATION ITEMS (1 to 7) */}
            <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <span style={{
                fontSize: '0.62rem',
                fontWeight: 800,
                letterSpacing: '1.2px',
                color: '#9CA3AF',
                textTransform: 'uppercase',
                padding: '0 0.5rem 0.2rem 0.5rem',
                opacity: isSidebarCollapsed ? 0 : 1,
                maxHeight: isSidebarCollapsed ? '0px' : '20px',
                overflow: 'hidden',
                transition: isSidebarCollapsed
                  ? 'opacity 120ms ease, max-height 250ms cubic-bezier(0.4, 0, 0.2, 1)'
                  : 'opacity 180ms ease 40ms, max-height 250ms cubic-bezier(0.4, 0, 0.2, 1)'
              }}>
                MENU
              </span>

              {[
                { id: 'home', label: 'Home', icon: LayoutDashboard },
                { id: 'play', label: 'Play', icon: Swords },
                { id: 'puzzles', label: 'Puzzles', icon: Puzzle },
                { id: 'learn', label: 'Learn', icon: GraduationCap },
                { id: 'books', label: 'Books', icon: Book },
                { id: 'news', label: 'News', icon: Newspaper },
                { id: 'leaderboard', label: 'Leaderboard', icon: Trophy }
              ].map((tab) => (
                <SidebarNavItem
                  key={tab.id}
                  tab={tab}
                  activeTab={activeTab}
                  isSidebarCollapsed={isSidebarCollapsed}
                  onClick={handleTabChange}
                  onHover={setCompanionContext}
                />
              ))}
            </nav>
          </div>

          {/* BOTTOM SECTION: PROFILE, SETTINGS, LOGOUT (8 to 10) + PIXEL AVATAR */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div style={{ height: '1px', backgroundColor: '#E5E7EB', margin: '0.25rem 0' }} />

            {/* Items 8 & 9 */}
            {[
              { id: 'profile', label: 'Profile', icon: User },
              { id: 'settings', label: 'Settings', icon: Settings }
            ].map((tab) => (
              <SidebarNavItem
                key={tab.id}
                tab={tab}
                activeTab={activeTab}
                isSidebarCollapsed={isSidebarCollapsed}
                onClick={handleTabChange}
              />
            ))}

            {/* Item 10: Logout */}
            <button
              onClick={onLogout}
              title={isSidebarCollapsed ? "Logout" : undefined}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-start',
                padding: '0.6rem 0.75rem',
                borderRadius: '8px',
                backgroundColor: 'transparent',
                color: '#EF4444',
                border: 'none',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer',
                width: '100%',
                overflow: 'hidden'
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, width: '20px' }}>
                <LogOut size={18} />
              </span>
              <span style={{
                opacity: isSidebarCollapsed ? 0 : 1,
                maxWidth: isSidebarCollapsed ? '0px' : '140px',
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                marginLeft: isSidebarCollapsed ? '0px' : '0.75rem',
                transition: isSidebarCollapsed
                  ? 'opacity 120ms ease, max-width 250ms cubic-bezier(0.4, 0, 0.2, 1), margin-left 250ms cubic-bezier(0.4, 0, 0.2, 1)'
                  : 'opacity 180ms ease 40ms, max-width 250ms cubic-bezier(0.4, 0, 0.2, 1), margin-left 250ms cubic-bezier(0.4, 0, 0.2, 1)',
                pointerEvents: isSidebarCollapsed ? 'none' : 'auto'
              }}>
                Logout
              </span>
            </button>

            {/* PIXEL ART AVATAR PROFILE FOOTER */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-start',
              padding: '0.5rem',
              backgroundColor: '#080808',
              borderRadius: '10px',
              border: '1px solid #171717',
              marginTop: '0.25rem',
              overflow: 'hidden'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', overflow: 'hidden', flex: 1 }}>
                <img
                  src="/pixel_avatar.jpg"
                  alt="Pixel Avatar"
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '6px',
                    objectFit: 'cover',
                    imageRendering: 'pixelated',
                    border: '1px solid #27272A',
                    flexShrink: 0
                  }}
                />
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  lineHeight: 1.1,
                  opacity: isSidebarCollapsed ? 0 : 1,
                  maxWidth: isSidebarCollapsed ? '0px' : '110px',
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                  transition: isSidebarCollapsed
                    ? 'opacity 120ms ease, max-width 250ms cubic-bezier(0.4, 0, 0.2, 1)'
                    : 'opacity 180ms ease 40ms, max-width 250ms cubic-bezier(0.4, 0, 0.2, 1)',
                  pointerEvents: isSidebarCollapsed ? 'none' : 'auto'
                }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#FFFFFF', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{name}</span>
                  <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#8E8E93' }}>{rating} ELO</span>
                </div>
              </div>

              <div style={{
                opacity: isSidebarCollapsed ? 0 : 1,
                maxWidth: isSidebarCollapsed ? '0px' : '28px',
                overflow: 'hidden',
                transition: isSidebarCollapsed
                  ? 'opacity 120ms ease, max-width 250ms cubic-bezier(0.4, 0, 0.2, 1)'
                  : 'opacity 180ms ease 40ms, max-width 250ms cubic-bezier(0.4, 0, 0.2, 1)',
                pointerEvents: isSidebarCollapsed ? 'none' : 'auto'
              }}>
                <button
                  onClick={() => alert('Notifications: No unread alerts.')}
                  title="Notifications"
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '6px',
                    backgroundColor: '#121215',
                    border: '1px solid #27272A',
                    color: '#A1A1AA',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    position: 'relative',
                    flexShrink: 0
                  }}
                >
                  <Bell size={14} />
                  <span style={{
                    position: 'absolute',
                    top: '5px',
                    right: '5px',
                    width: '5px',
                    height: '5px',
                    backgroundColor: '#10B981',
                    borderRadius: '50%'
                  }} />
                </button>
              </div>
            </div>
          </div>
        </aside>
        )}

        {/* RIGHT SIDE MAIN APP SHELL */}
        <div style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          height: isMatchActive ? '100vh' : 'auto',
          minHeight: isMatchActive ? '100vh' : 'calc(100vh - 56px)',
          overflowY: isMatchActive ? 'hidden' : 'auto',
          overflowX: 'hidden'
        }}>
          {/* MOBILE TOP BAR (For screen widths < 868px - Hidden during active match) */}
          {!isMatchActive && (
            <header className="dash-mobile-flex" style={{
              width: '100%',
              backgroundColor: '#000000',
              borderBottom: '1px solid #141416',
              color: '#FFFFFF',
              padding: '0.85rem 1.25rem',
              alignItems: 'center',
              justifyContent: 'space-between',
              position: 'sticky',
              top: 0,
              zIndex: 50
            }}>
              <div
                onClick={() => handleTabChange('home')}
                style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', cursor: 'pointer' }}
              >
                <img
                  src="/official_logo.png"
                  alt="Strategic Chess Logo"
                  style={{ width: '32px', height: '32px', borderRadius: '6px', objectFit: 'contain' }}
                />
                <span style={{ fontSize: '0.9rem', fontWeight: 900, letterSpacing: '1px' }}>STRATEGIC CHESS</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <img src="/pixel_avatar.jpg" alt="Avatar" style={{ width: '28px', height: '28px', borderRadius: '6px', imageRendering: 'pixelated' }} />
                <button onClick={onLogout} style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer' }}>
                  <LogOut size={16} />
                </button>
              </div>
            </header>
          )}

          {/* MAIN CONTENT VIEWPORT WITH PAGE NAVIGATION TRANSITION */}
          <main style={isMatchActive ? {
            width: '100%',
            height: '100%',
            maxHeight: '100dvh',
            margin: 0,
            padding: 0,
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden'
          } : {
            maxWidth: '1240px',
            width: '100%',
            margin: '0 auto',
            padding: (activeTab === 'learn' && location.pathname.includes('/learn/endgame-mastery'))
              ? '0.75rem 1.25rem'
              : '2rem 1.5rem 5rem 1.5rem',
            flex: 1
          }}>
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                style={isMatchActive ? {
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden'
                } : { width: '100%' }}
              >

                {/* TAB 1: DASHBOARD HOME OVERVIEW */}
                {activeTab === 'home' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>

                    {/* 1. INTERACTIVE 3D COMPANION BOT & WELCOME SECTION */}
                    <CompanionWelcomeSection
                      name={name}
                      rating={rating}
                      rankTitle={rankInfo?.title || 'Player'}
                      streak={streakData?.count || 1}
                      activeContext={companionContext}
                    />

                    {/* 2. MAIN PROGRESS + ACTIVITY SECTION (Primary Rating vs Supporting Calendar) */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                      gap: '2rem',
                      alignItems: 'stretch'
                    }}>

                      {/* PRIMARY LEFT AREA: RATING & RANK PROGRESS */}
                      <div
                        onMouseEnter={() => setCompanionContext('rating')}
                        onMouseLeave={() => setCompanionContext(null)}
                        style={{
                          backgroundColor: '#080808',
                          border: '1px solid #171717',
                          borderRadius: '16px',
                          padding: '1.75rem 2rem',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          gap: '1.5rem',
                          boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
                          transition: 'border-color 0.2s ease'
                        }}
                      >
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{
                              fontFamily: "'Anton', 'Bebas Neue', sans-serif",
                              fontSize: '1.25rem',
                              letterSpacing: '1px',
                              color: rankInfo.color
                            }}>
                              {rankInfo.title}
                            </span>
                            {recentRatingDelta !== null && recentRatingDelta !== undefined ? (
                              <span style={{
                                fontSize: '0.75rem',
                                fontWeight: 800,
                                color: recentRatingDelta > 0 ? '#10B981' : recentRatingDelta < 0 ? '#EF4444' : '#8E8E93',
                                backgroundColor: recentRatingDelta > 0 ? 'rgba(16, 185, 129, 0.12)' : recentRatingDelta < 0 ? 'rgba(239, 68, 68, 0.12)' : 'rgba(255, 255, 255, 0.05)',
                                padding: '0.2rem 0.6rem',
                                borderRadius: '14px',
                                border: `1px solid ${recentRatingDelta > 0 ? 'rgba(16, 185, 129, 0.25)' : recentRatingDelta < 0 ? 'rgba(239, 68, 68, 0.25)' : 'rgba(255, 255, 255, 0.1)'}`
                              }}>
                                {recentRatingDelta > 0 ? `+${recentRatingDelta} ELO` : `${recentRatingDelta} ELO`}
                              </span>
                            ) : (
                              <span style={{
                                fontSize: '0.75rem',
                                fontWeight: 800,
                                color: rankInfo.color,
                                backgroundColor: `${rankInfo.color}18`,
                                padding: '0.2rem 0.6rem',
                                borderRadius: '14px',
                                border: `1px solid ${rankInfo.color}40`
                              }}>
                                {rankInfo.title}
                              </span>
                            )}
                          </div>

                          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.65rem', marginTop: '0.35rem' }}>
                            <span style={{
                              fontFamily: "'Anton', 'Bebas Neue', sans-serif",
                              fontSize: '4.5rem',
                              lineHeight: 1,
                              letterSpacing: '1px',
                              color: '#FFFFFF',
                              fontWeight: 400
                            }}>
                              {rating}
                            </span>
                            <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#8E8E93' }}>
                              ELO
                            </span>
                          </div>
                        </div>

                        {/* RANK PROGRESS BAR */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', paddingTop: '1rem', borderTop: '1px solid #141416' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem', fontWeight: 800, color: '#8E8E93', letterSpacing: '0.5px' }}>
                            <span>RANK PROGRESS</span>
                            <span>{rating} / {rankInfo.nextElo}</span>
                          </div>
                          <div style={{
                            height: '6px',
                            backgroundColor: '#141416',
                            borderRadius: '10px',
                            overflow: 'hidden',
                            width: '100%'
                          }}>
                            <div style={{
                              width: `${progressPercent}%`,
                              height: '100%',
                              backgroundColor: '#FFFFFF',
                              borderRadius: '10px',
                              transition: 'width 0.4s ease'
                            }} />
                          </div>
                        </div>
                      </div>

                      {/* SUPPORTING RIGHT AREA: COMPACT ACTIVITY CALENDAR */}
                      <div
                        onMouseEnter={() => setCompanionContext('activity')}
                        onMouseLeave={() => setCompanionContext(null)}
                        style={{
                          backgroundColor: '#080808',
                          border: '1px solid #171717',
                          borderRadius: '16px',
                          padding: '1.5rem 1.75rem',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '1rem',
                          boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
                          transition: 'border-color 0.2s ease'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <span style={{ fontSize: '0.68rem', fontWeight: 800, letterSpacing: '1.4px', color: '#8E8E93', textTransform: 'uppercase' }}>
                              ACTIVITY
                            </span>
                            <h3 style={{ fontFamily: "'Anton', 'Bebas Neue', sans-serif", fontSize: '1.4rem', lineHeight: 1.1, margin: '0.15rem 0 0 0', color: '#FFFFFF', letterSpacing: '0.5px' }}>
                              {currentMonthName} {currentYear}
                            </h3>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', fontWeight: 800, color: streakData.fireActive ? '#F97316' : '#8E8E93' }}>
                            <Flame size={15} fill={streakData.fireActive ? '#F97316' : 'transparent'} />
                            <span> {streakData.count} day streak</span>
                          </div>
                        </div>

                        {/* WEEKDAY LABELS */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '0.25rem', textAlign: 'center' }}>
                          {weekDayLabels.map((dayLabel, idx) => (
                            <span key={idx} style={{ fontSize: '0.68rem', fontWeight: 800, color: '#52525B' }}>
                              {dayLabel}
                            </span>
                          ))}
                        </div>

                        {/* CALENDAR DAYS GRID */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '0.35rem' }}>
                          {[...Array(firstDayOfWeek)].map((_, i) => (
                            <div key={`blank-${i}`} style={{ height: '32px' }} />
                          ))}

                          {[...Array(daysInMonth)].map((_, i) => {
                            const dayNum = i + 1;
                            const monthStr = String(currentMonth + 1).padStart(2, '0');
                            const dayStr = String(dayNum).padStart(2, '0');
                            const dateString = `${currentYear}-${monthStr}-${dayStr}`;

                            const isToday = dayNum === currentDay;
                            const isFuture = dayNum > currentDay;
                            const isPlayed = playedDates.includes(dateString) || (isToday && streakData.fireActive);

                            return (
                              <div
                                key={dayNum}
                                style={{
                                  height: '32px',
                                  borderRadius: '6px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: '0.78rem',
                                  fontWeight: isToday ? 900 : 600,
                                  position: 'relative',
                                  backgroundColor: isPlayed
                                    ? '#10B981'
                                    : (isToday ? '#16161A' : 'transparent'),
                                  color: isPlayed
                                    ? '#FFFFFF'
                                    : (isToday
                                      ? '#FFFFFF'
                                      : (isFuture
                                        ? '#3F3F46'
                                        : '#8E8E93')),
                                  border: isToday
                                    ? (isPlayed ? '2px solid #10B981' : '2px solid rgba(255, 255, 255, 0.4)')
                                    : '1px solid #141416'
                                }}
                              >
                                {dayNum}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                    </div>

                    {/* 3. QUICK ACTIONS ROW (3 Compact Action Tiles) */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                      <span style={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '1.4px', color: '#8E8E93', textTransform: 'uppercase' }}>
                        QUICK ACTIONS
                      </span>

                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                        gap: '1.25rem'
                      }}>
                        {[
                          {
                            id: 'play',
                            title: 'PLAY',
                            subtitle: 'Start a chess match',
                            icon: Swords,
                            action: () => handleTabChange('play')
                          },
                          {
                            id: 'puzzles',
                            title: 'PUZZLES',
                            subtitle: 'Solve a tactical puzzle',
                            icon: Puzzle,
                            action: () => handleTabChange('puzzles')
                          },
                          {
                            id: 'learn',
                            title: 'LEARN',
                            subtitle: 'Continue learning',
                            icon: GraduationCap,
                            action: () => handleTabChange('learn')
                          }
                        ].map((item) => {
                          const ItemIcon = item.icon;
                          return (
                            <div
                              key={item.id}
                              onClick={item.action}
                              style={{
                                backgroundColor: '#080808',
                                border: '1px solid #171717',
                                borderRadius: '14px',
                                padding: '1.25rem 1.5rem',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                cursor: 'pointer',
                                transition: 'all 0.18s ease',
                                boxShadow: '0 4px 16px rgba(0,0,0,0.4)'
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.25)';
                                e.currentTarget.style.transform = 'translateY(-2px)';
                                setCompanionContext(item.id);
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.borderColor = '#171717';
                                e.currentTarget.style.transform = 'translateY(0)';
                                setCompanionContext(null);
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                                <div style={{
                                  width: '38px',
                                  height: '38px',
                                  borderRadius: '10px',
                                  backgroundColor: '#121215',
                                  border: '1px solid #1A1A1D',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  color: '#FFFFFF'
                                }}>
                                  <ItemIcon size={19} />
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                  <span style={{ fontFamily: "'Anton', 'Bebas Neue', sans-serif", fontSize: '1.15rem', letterSpacing: '0.5px', color: '#FFFFFF', lineHeight: 1.1 }}>
                                    {item.title}
                                  </span>
                                  <span style={{ fontSize: '0.78rem', color: '#8E8E93', marginTop: '2px' }}>
                                    {item.subtitle}
                                  </span>
                                </div>
                              </div>

                              <span style={{ fontSize: '1.1rem', color: '#8E8E93', fontWeight: 800 }}>→</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                  </div>
                )}

                {/* TAB 2: PLAY SECTION WITH SUB-VIEW NAVIGATION & EXACT REFERENCE UI */}
                {activeTab === 'play' && (
                  <div style={isMatchActive ? {
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden'
                  } : {
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1.5rem',
                    maxWidth: '760px',
                    margin: '0 auto'
                  }}>

                    {/* 1. MAIN GAME MODE SELECTION VIEW */}
                    {playSubMode === 'main' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                        {/* ELEGANT HEADER WITH STANDING CHESS KING PIECE */}
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '1.5rem',
                          paddingBottom: '0.5rem'
                        }}>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <h1 style={{
                              fontFamily: "'Anton', 'Bebas Neue', sans-serif",
                              fontSize: 'clamp(2.8rem, 5.5vw, 4rem)',
                              margin: 0,
                              color: isDarkMode ? '#FFFFFF' : '#111111',
                              lineHeight: 0.95,
                              letterSpacing: '0.02em',
                              textTransform: 'uppercase'
                            }}>
                              CHOOSE<br />GAME MODE
                            </h1>
                            <p style={{
                              color: isDarkMode ? '#A1A1AA' : '#4B5563',
                              fontSize: '1.05rem',
                              margin: '0.85rem 0 0 0',
                              fontWeight: 500,
                              maxWidth: '340px',
                              lineHeight: 1.35
                            }}>
                              Pick how you want to play and start your chess journey.
                            </p>
                          </div>

                          {/* 3D STANDING CHESS KING IMAGE */}
                          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <img
                              src="/Black_King_clean.png"
                              alt="Strategic Chess King"
                              style={{
                                height: '190px',
                                objectFit: 'contain',
                                filter: isDarkMode
                                  ? 'drop-shadow(0 12px 24px rgba(0,0,0,0.6))'
                                  : 'drop-shadow(0 12px 24px rgba(0,0,0,0.18))'
                              }}
                            />
                          </div>
                        </div>

                        {/* 3 VERTICALLY STACKED HIGH-CONTRAST GAME MODE CARDS */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
                          {[
                            {
                              id: 'online',
                              title: 'ONLINE MATCH',
                              subtitle: 'Play with random players around the world.',
                              icon: Globe
                            },
                            {
                              id: 'friend',
                              title: 'PLAY WITH FRIEND',
                              subtitle: 'Invite your friends and challenge them.',
                              icon: Users
                            },
                            {
                              id: 'bot',
                              title: 'AI MATCH',
                              subtitle: 'Play against advanced AI opponents.',
                              icon: Bot
                            }
                          ].map((mode) => {
                            const ModeIcon = mode.icon;

                            return (
                              <div
                                key={mode.id}
                                onClick={() => {
                                  setPlaySubMode(mode.id);
                                  setIsSearchingOnline(false);
                                }}
                                style={{
                                  backgroundColor: '#080808',
                                  border: '1px solid #171717',
                                  borderRadius: '20px',
                                  padding: '1.25rem 1.6rem',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  cursor: 'pointer',
                                  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                  boxShadow: '0 4px 20px rgba(0,0,0,0.4)'
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.backgroundColor = '#101014';
                                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.28)';
                                  e.currentTarget.style.transform = 'translateY(-2px)';
                                  const tile = e.currentTarget.querySelector('.mode-card-tile');
                                  if (tile) tile.style.backgroundColor = '#18181C';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.backgroundColor = '#080808';
                                  e.currentTarget.style.borderColor = '#171717';
                                  e.currentTarget.style.transform = 'translateY(0)';
                                  const tile = e.currentTarget.querySelector('.mode-card-tile');
                                  if (tile) tile.style.backgroundColor = '#121215';
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                                  {/* Square Icon Tile */}
                                  <div
                                    className="mode-card-tile"
                                    style={{
                                      width: '60px',
                                      height: '60px',
                                      borderRadius: '14px',
                                      backgroundColor: '#121215',
                                      border: '1px solid #1A1A1D',
                                      color: '#FFFFFF',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      flexShrink: 0,
                                      transition: 'all 0.2s ease'
                                    }}
                                  >
                                    <ModeIcon size={28} />
                                  </div>

                                  {/* Text Details */}
                                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <h3
                                      className="mode-card-title"
                                      style={{
                                        fontFamily: "'Anton', 'Bebas Neue', sans-serif",
                                        fontSize: '1.55rem',
                                        margin: 0,
                                        letterSpacing: '0.03em',
                                        color: '#FFFFFF',
                                        lineHeight: 1.1,
                                        textTransform: 'uppercase'
                                      }}
                                    >
                                      {mode.title}
                                    </h3>
                                    <p
                                      className="mode-card-sub"
                                      style={{
                                        fontSize: '0.88rem',
                                        color: '#8E8E93',
                                        margin: '0.25rem 0 0 0',
                                        fontWeight: 500
                                      }}
                                    >
                                      {mode.subtitle}
                                    </p>
                                  </div>
                                </div>

                                {/* Right Arrow */}
                                <div
                                  className="mode-card-arrow"
                                  style={{
                                    color: '#FFFFFF',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    paddingLeft: '1rem'
                                  }}
                                >
                                  <ArrowRight size={24} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* 2. SUB-VIEW: AI DIFFICULTY SELECTION (MATCHING EXACT REFERENCE IMAGE) */}
                    {playSubMode === 'bot' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                        {/* Top Navigation Row: Back Button */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <button
                            onClick={() => setPlaySubMode('main')}
                            title="Back to Game Modes"
                            style={{
                              background: 'none',
                              border: 'none',
                              color: isDarkMode ? '#FFFFFF' : '#111111',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              padding: '0.35rem',
                              borderRadius: '8px',
                              marginLeft: '-0.35rem'
                            }}
                          >
                            <ChevronLeft size={28} />
                          </button>
                        </div>

                        {/* AI DIFFICULTY HEADER WITH STANDING PAWN IMAGE */}
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '1.5rem'
                        }}>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <h1 style={{
                              fontFamily: "'Anton', 'Bebas Neue', sans-serif",
                              fontSize: 'clamp(2.8rem, 5.5vw, 3.8rem)',
                              margin: 0,
                              color: isDarkMode ? '#FFFFFF' : '#111111',
                              lineHeight: 0.95,
                              letterSpacing: '0.02em',
                              textTransform: 'uppercase'
                            }}>
                              AI<br />DIFFICULTY
                            </h1>
                            <p style={{
                              color: isDarkMode ? '#A1A1AA' : '#4B5563',
                              fontSize: '1rem',
                              margin: '0.75rem 0 0 0',
                              fontWeight: 500,
                              maxWidth: '320px',
                              lineHeight: 1.35
                            }}>
                              Select the difficulty level that matches your skills.
                            </p>
                          </div>

                          {/* CHESS PAWN GRAPHIC */}
                          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <img
                              src="/Black_pawn_clean.png"
                              alt="Chess Pawn"
                              style={{
                                height: '160px',
                                objectFit: 'contain',
                                filter: isDarkMode
                                  ? 'drop-shadow(0 12px 24px rgba(0,0,0,0.6))'
                                  : 'drop-shadow(0 12px 24px rgba(0,0,0,0.15))'
                              }}
                            />
                          </div>
                        </div>

                        {/* 6-TIER DIFFICULTY SELECTION LIST CARD */}
                        <div style={{
                          backgroundColor: '#080808',
                          border: '1px solid #171717',
                          borderRadius: '20px',
                          overflow: 'hidden',
                          display: 'flex',
                          flexDirection: 'column',
                          boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
                          marginTop: '0.25rem'
                        }}>
                          {[
                            { id: 'Beginner', title: 'BEGINNER', subtitle: '0 ELO Rating', blocks: 1, icon: BarChart3 },
                            { id: 'Easy', title: 'EASY', subtitle: '200 ELO Rating', blocks: 2, icon: BarChart3 },
                            { id: 'Medium', title: 'MEDIUM', subtitle: '500 ELO Rating', blocks: 3, icon: BarChart3 },
                            { id: 'Hard', title: 'HARD', subtitle: '700 ELO Rating', blocks: 4, icon: BarChart3 },
                            { id: 'Grandmaster', title: 'GRANDMASTER', subtitle: '1000 ELO Rating', blocks: 5, icon: Crown }
                          ].map((diff, index, arr) => {
                            const isSelected = botDifficulty === diff.id;
                            const rowBg = isSelected ? '#141418' : 'transparent';
                            const rowTitleColor = '#FFFFFF';
                            const rowSubColor = isSelected ? '#A1A1AA' : '#71717A';
                            const rowIconColor = isSelected ? '#FFFFFF' : '#71717A';
                            const rowBorder = index < arr.length - 1 ? '1px solid #141416' : 'none';

                            const LevelIcon = diff.icon;

                            return (
                              <div
                                key={diff.id}
                                onClick={() => setBotDifficulty(diff.id)}
                                style={{
                                  padding: '1.1rem 1.5rem',
                                  backgroundColor: rowBg,
                                  borderBottom: rowBorder,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  cursor: 'pointer',
                                  transition: 'all 0.15s ease'
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                                  <div style={{ color: rowIconColor, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px' }}>
                                    <LevelIcon size={24} />
                                  </div>

                                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <span style={{
                                      fontFamily: "'Anton', 'Bebas Neue', sans-serif",
                                      fontSize: '1.35rem',
                                      letterSpacing: '0.03em',
                                      color: rowTitleColor,
                                      lineHeight: 1.1,
                                      textTransform: 'uppercase'
                                    }}>
                                      {diff.title}
                                    </span>
                                    <span style={{
                                      fontSize: '0.82rem',
                                      color: rowSubColor,
                                      fontWeight: 500,
                                      marginTop: '0.15rem'
                                    }}>
                                      {diff.subtitle}
                                    </span>
                                  </div>
                                </div>

                                {/* Right side: 5-block meter & radio indicator */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                                  <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                                    {[1, 2, 3, 4, 5].map((blockNum) => {
                                      const isFilled = blockNum <= diff.blocks;
                                      return (
                                        <div
                                          key={blockNum}
                                          style={{
                                            width: '10px',
                                            height: '10px',
                                            borderRadius: '2px',
                                            backgroundColor: isFilled ? '#FFFFFF' : 'transparent',
                                            border: isFilled ? 'none' : '1px solid #3F3F46'
                                          }}
                                        />
                                      );
                                    })}
                                  </div>

                                  {/* Radio Button Circle Indicator */}
                                  <div style={{
                                    width: '20px',
                                    height: '20px',
                                    borderRadius: '50%',
                                    border: isSelected ? '2px solid #FFFFFF' : '2px solid #3F3F46',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                  }}>
                                    {isSelected && (
                                      <div style={{
                                        width: '8px',
                                        height: '8px',
                                        borderRadius: '50%',
                                        backgroundColor: '#FFFFFF'
                                      }} />
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* PIECE COLOR SELECTION SECTION */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.35rem' }}>
                          <label style={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '1.2px', color: '#8E8E93', textTransform: 'uppercase' }}>
                            CHOOSE PIECE COLOR
                          </label>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
                            {[
                              { id: 'white', label: 'White ♔' },
                              { id: 'random', label: 'Random 🎲' },
                              { id: 'black', label: 'Black ♚' }
                            ].map((s) => (
                              <button
                                key={s.id}
                                onClick={() => setBotSide(s.id)}
                                style={{
                                  padding: '0.85rem',
                                  borderRadius: '12px',
                                  backgroundColor: botSide === s.id ? '#141418' : '#080808',
                                  color: '#FFFFFF',
                                  border: botSide === s.id ? '1px solid rgba(255, 255, 255, 0.45)' : '1px solid #171717',
                                  fontWeight: 800,
                                  fontSize: '0.88rem',
                                  cursor: 'pointer',
                                  transition: 'all 0.15s ease'
                                }}
                              >
                                {s.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* CONFIRM SELECTION PRIMARY BUTTON */}
                        <button
                          onClick={startAIMatch}
                          style={{
                            backgroundColor: isDarkMode ? '#FFFFFF' : '#000000',
                            color: isDarkMode ? '#000000' : '#FFFFFF',
                            border: 'none',
                            borderRadius: '16px',
                            padding: '1.2rem',
                            fontWeight: 800,
                            fontSize: '1.05rem',
                            fontFamily: "'Anton', sans-serif",
                            letterSpacing: '0.04em',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.75rem',
                            transition: 'all 0.15s ease',
                            marginTop: '0.25rem'
                          }}
                        >
                          <span>CONFIRM SELECTION</span>
                          <ArrowRight size={20} />
                        </button>
                      </div>
                    )}

                    {/* 3. SUB-VIEW: ONLINE MATCHMAKING */}
                    {playSubMode === 'online' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <button
                            onClick={() => {
                              if (isSearchingOnline) {
                                cancelOnlineMatchmaking();
                              }
                              setPlaySubMode('main');
                            }}
                            title="Back to Game Modes"
                            style={{
                              background: 'none',
                              border: 'none',
                              color: isDarkMode ? '#FFFFFF' : '#111111',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              padding: '0.35rem',
                              borderRadius: '8px',
                              marginLeft: '-0.35rem'
                            }}
                          >
                            <ChevronLeft size={28} />
                          </button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <h1 style={{
                            fontFamily: "'Anton', 'Bebas Neue', sans-serif",
                            fontSize: 'clamp(2.5rem, 5vw, 3.5rem)',
                            margin: 0,
                            color: isDarkMode ? '#FFFFFF' : '#111111',
                            lineHeight: 0.95,
                            letterSpacing: '0.02em',
                            textTransform: 'uppercase'
                          }}>
                            ONLINE<br />MATCHMAKING
                          </h1>
                          <p style={{
                            color: isDarkMode ? '#A1A1AA' : '#4B5563',
                            fontSize: '1rem',
                            margin: '0.75rem 0 0 0',
                            fontWeight: 500
                          }}>
                            Select your preferred time format and start searching for an opponent.
                          </p>
                        </div>

                        <div style={{
                          backgroundColor: isDarkMode ? '#141417' : '#FFFFFF',
                          border: isDarkMode ? '1px solid #27272A' : '1px solid #E5E7EB',
                          borderRadius: '20px',
                          padding: '1.75rem 2rem',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '1.5rem'
                        }}>
                          <div>
                            <label style={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '1.2px', color: isDarkMode ? '#A1A1AA' : '#6B7280', textTransform: 'uppercase' }}>
                              SELECT TIME CONTROL
                            </label>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem', marginTop: '0.75rem' }}>
                              {[
                                { id: '10min', label: '10 min', name: 'Rapid' },
                                { id: '5min', label: '5 min', name: 'Blitz' },
                                { id: '3min', label: '3 min', name: 'Blitz' },
                                { id: '1min', label: '1 min', name: 'Bullet' }
                              ].map((tc) => (
                                <button
                                  key={tc.id}
                                  onClick={() => setOnlineTimeControl(tc.id)}
                                  style={{
                                    padding: '0.85rem 0.75rem',
                                    borderRadius: '12px',
                                    backgroundColor: onlineTimeControl === tc.id
                                      ? (isDarkMode ? '#FFFFFF' : '#000000')
                                      : (isDarkMode ? '#27272A' : '#F3F4F6'),
                                    color: onlineTimeControl === tc.id
                                      ? (isDarkMode ? '#000000' : '#FFFFFF')
                                      : (isDarkMode ? '#FFFFFF' : '#374151'),
                                    border: 'none',
                                    fontWeight: 800,
                                    fontSize: '0.9rem',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    gap: '0.15rem',
                                    transition: 'all 0.15s ease'
                                  }}
                                >
                                  <span>{tc.label}</span>
                                  <span style={{ fontSize: '0.7rem', opacity: 0.7, fontWeight: 600 }}>{tc.name}</span>
                                </button>
                              ))}
                            </div>
                          </div>

                          <button
                            onClick={isSearchingOnline ? cancelOnlineMatchmaking : startOnlineMatch}
                            disabled={isConnectingWs}
                            style={{
                              backgroundColor: isSearchingOnline ? '#DC2626' : (isDarkMode ? '#FFFFFF' : '#000000'),
                              color: isSearchingOnline ? '#FFFFFF' : (isDarkMode ? '#000000' : '#FFFFFF'),
                              border: 'none',
                              borderRadius: '16px',
                              padding: '1.2rem',
                              fontWeight: 800,
                              fontSize: '1.05rem',
                              fontFamily: "'Anton', sans-serif",
                              letterSpacing: '0.04em',
                              cursor: isConnectingWs ? 'not-allowed' : 'pointer',
                              opacity: isConnectingWs ? 0.7 : 1,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '0.75rem',
                              transition: 'all 0.2s ease'
                            }}
                          >
                            <span>
                              {isConnectingWs
                                ? 'CONNECTING TO SERVER...'
                                : isSearchingOnline
                                  ? 'SEARCHING FOR OPPONENT... (CLICK TO CANCEL)'
                                  : 'START ONLINE MATCH'}
                            </span>
                            {isConnectingWs ? (
                              <RefreshCw className="animate-spin" size={20} />
                            ) : isSearchingOnline ? (
                              <X size={20} />
                            ) : (
                              <ArrowRight size={20} />
                            )}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* 4. SUB-VIEW: PLAY WITH FRIEND */}
                    {playSubMode === 'friend' && (
                      <PlayWithFriend
                        user={user}
                        profile={effectiveProfile}
                        onBack={() => setPlaySubMode('main')}
                        onGameMatched={handleGameMatched}
                      />
                    )}

                    {/* 5. SUB-VIEW: LIVE AI CHESS MATCH VIEW */}
                    {playSubMode === 'match' && (
                      <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        height: '100%',
                        maxHeight: '100dvh',
                        width: '100%',
                        padding: '0.25rem 0.5rem',
                        boxSizing: 'border-box',
                        overflow: 'hidden'
                      }}>
                        <div style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.3rem',
                          width: 'min(calc(100dvh - 175px), calc(100vw - 32px), 620px)',
                          maxWidth: '100%',
                          boxSizing: 'border-box'
                        }}>
                          {/* Match Controls & Header */}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', height: '32px' }}>
                            <button
                              onClick={() => {
                                if (gameMode === 'online') {
                                  setCurrentGameId(null);
                                  setGameMode('ai');
                                  setOpponentProfile(null);
                                  setMatchOutcome(null);
                                }
                                setPlaySubMode('main');
                              }}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.35rem',
                                backgroundColor: '#1E1E24',
                                color: '#FFFFFF',
                                border: '1px solid #2A2A32',
                                borderRadius: '8px',
                                padding: '0.3rem 0.7rem',
                                fontWeight: 700,
                                fontSize: '0.8rem',
                                cursor: 'pointer',
                                transition: 'background-color 0.15s ease'
                              }}
                            >
                              <ChevronLeft size={16} />
                              <span>Modes</span>
                            </button>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                              <button
                                onClick={handleUndoMove}
                                title="Undo Move"
                                disabled={isAIThinking || !!matchOutcome || gameMode === 'online'}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '0.3rem',
                                  backgroundColor: '#0E0E12',
                                  color: '#FFFFFF',
                                  border: '1px solid #1A1A1D',
                                  borderRadius: '8px',
                                  padding: '0.3rem 0.7rem',
                                  fontWeight: 700,
                                  fontSize: '0.78rem',
                                  cursor: (isAIThinking || !!matchOutcome || gameMode === 'online') ? 'not-allowed' : 'pointer',
                                  opacity: (isAIThinking || !!matchOutcome || gameMode === 'online') ? 0.4 : 1
                                }}
                              >
                                <RotateCcw size={14} />
                                <span>Undo</span>
                              </button>

                              <button
                                onClick={handleResign}
                                title="Resign Match"
                                disabled={!!matchOutcome}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '0.3rem',
                                  backgroundColor: '#1E0E0E',
                                  color: '#EF4444',
                                  border: '1px solid #3F1D1D',
                                  borderRadius: '8px',
                                  padding: '0.3rem 0.7rem',
                                  fontWeight: 700,
                                  fontSize: '0.78rem',
                                  cursor: !!matchOutcome ? 'not-allowed' : 'pointer',
                                  opacity: !!matchOutcome ? 0.4 : 1
                                }}
                              >
                                <Flag size={14} />
                                <span>Resign</span>
                              </button>
                            </div>
                          </div>

                          {/* OPPONENT CARD (TOP) */}
                          {(() => {
                            const isOnline = gameMode === 'online';
                            const botProfile = getBotProfile(botDifficulty);
                            const opponentDisplayName = isOnline
                              ? (opponentProfile?.name || opponentProfile?.full_name || 'Opponent')
                              : botProfile.name;
                            const opponentDisplayRating = isOnline
                              ? (typeof opponentProfile?.rating === 'number'
                                ? `${opponentProfile.rating} ELO`
                                : (opponentProfile?.isUnrated ? 'Unrated' : (opponentProfile?.ratingError ? 'Rating Unavailable' : 'Unrated')))
                              : `${botProfile.rating} ELO`;
                            const opponentAvatar = isOnline
                              ? (opponentProfile?.avatar || '/pixel_avatar.jpg')
                              : botProfile.avatar;
                            const opponentBadge = isOnline
                              ? (userColor === 'w' ? '♚' : '♔')
                              : botProfile.flag;
                            const isOpponentTurn = chessRef.current.turn() !== userColor;
                            return (
                              <div style={{
                                width: '100%',
                                backgroundColor: '#080808',
                                border: '1px solid #171717',
                                borderRadius: '10px',
                                padding: '0.3rem 0.75rem',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                boxShadow: '0 2px 10px rgba(0,0,0,0.5)',
                                boxSizing: 'border-box'
                              }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                                  <div style={{ position: 'relative', width: '32px', height: '32px', flexShrink: 0 }}>
                                    <img
                                      src={opponentAvatar}
                                      alt={isOnline ? "Opponent Avatar" : "Bot Avatar"}
                                      style={{
                                        width: '32px',
                                        height: '32px',
                                        borderRadius: '7px',
                                        objectFit: 'cover',
                                        border: '1px solid #27272A'
                                      }}
                                    />
                                    {isOpponentTurn && !matchOutcome && (
                                      <span style={{
                                        position: 'absolute',
                                        bottom: '-2px',
                                        right: '-2px',
                                        width: '8px',
                                        height: '8px',
                                        borderRadius: '50%',
                                        backgroundColor: '#10B981',
                                        boxShadow: '0 0 6px #10B981'
                                      }} />
                                    )}
                                  </div>
                                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                      <span style={{ fontWeight: 800, fontSize: '0.88rem', color: '#FFFFFF', lineHeight: 1.1 }}>
                                        {opponentDisplayName}
                                      </span>
                                      <span style={{ fontSize: '0.78rem' }}>{opponentBadge}</span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.05rem' }}>
                                      <span style={{
                                        fontSize: '0.68rem',
                                        fontWeight: 800,
                                        backgroundColor: '#121215',
                                        color: '#8E8E93',
                                        padding: '0.1rem 0.4rem',
                                        borderRadius: '4px'
                                      }}>
                                        {opponentDisplayRating}
                                      </span>
                                      {!isOnline && isAIThinking && (
                                        <span style={{ fontSize: '0.68rem', color: '#3B82F6', fontWeight: 700, fontStyle: 'italic' }}>
                                          Thinking...
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                {/* TIMER BOX */}
                                <div style={{
                                  backgroundColor: isOpponentTurn && !matchOutcome ? '#18181D' : '#0D0D10',
                                  color: isOpponentTurn && !matchOutcome ? '#FFFFFF' : '#8E8E93',
                                  border: '1px solid #1A1A1D',
                                  borderRadius: '8px',
                                  padding: '0.25rem 0.6rem',
                                  fontFamily: "'Anton', monospace",
                                  fontSize: '1.15rem',
                                  letterSpacing: '1px',
                                  boxShadow: isOpponentTurn ? '0 0 10px rgba(16, 185, 129, 0.2)' : 'none',
                                  transition: 'all 0.2s ease',
                                  lineHeight: 1
                                }}>
                                  {formatTimer(aiTimeLeft)}
                                </div>
                              </div>
                            );
                          })()}

                          {/* OPPONENT DISCONNECTION NOTICE BANNER */}
                          {gameMode === 'online' && opponentDisconnectNotice && (
                            <div style={{
                              width: '100%',
                              backgroundColor: '#261302',
                              border: '1px solid #B45309',
                              borderRadius: '8px',
                              padding: '0.25rem 0.65rem',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              color: '#FDE68A',
                              fontSize: '0.78rem',
                              fontWeight: 600,
                              boxShadow: '0 2px 10px rgba(0, 0, 0, 0.4)',
                              boxSizing: 'border-box'
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <AlertCircle size={15} color="#F59E0B" />
                                <span>Opponent disconnected. Waiting for rejoin...</span>
                              </div>
                              <span style={{
                                backgroundColor: '#5C270A',
                                padding: '0.1rem 0.45rem',
                                borderRadius: '4px',
                                fontVariantNumeric: 'tabular-nums',
                                fontWeight: 800,
                                color: '#FEF3C7',
                                fontSize: '0.75rem'
                              }}>
                                {opponentGraceSecondsLeft !== null ? `${opponentGraceSecondsLeft}s` : '45s'}
                              </span>
                            </div>
                          )}

                          {/* 8x8 CHESSBOARD VIEW */}
                          <div style={{
                            width: '100%',
                            aspectRatio: '1',
                            backgroundColor: '#B58863',
                            border: '2px solid #1A1A1D',
                            borderRadius: '12px',
                            boxShadow: '0 12px 36px rgba(0,0,0,0.85)',
                            overflow: 'hidden',
                            display: 'grid',
                            gridTemplateColumns: 'repeat(8, 1fr)',
                            gridTemplateRows: 'repeat(8, 1fr)',
                            position: 'relative',
                            userSelect: 'none'
                          }}>
                            {/* CLIENT RECONNECTING OVERLAY */}
                            {isReconnectingOnline && (
                              <div style={{
                                position: 'absolute',
                                top: 0, left: 0, right: 0, bottom: 0,
                                backgroundColor: 'rgba(0,0,0,0.72)',
                                backdropFilter: 'blur(4px)',
                                zIndex: 35,
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '0.75rem',
                                color: '#FFFFFF',
                                padding: '1.5rem',
                                textAlign: 'center'
                              }}>
                                <div style={{
                                  width: '34px',
                                  height: '34px',
                                  border: '3px solid rgba(255,255,255,0.2)',
                                  borderTopColor: '#6366F1',
                                  borderRadius: '50%',
                                  animation: 'spin 1s linear infinite'
                                }} />
                                <div style={{ fontWeight: 800, fontSize: '1rem', letterSpacing: '0.5px' }}>
                                  Reconnecting to match...
                                </div>
                                <div style={{ fontSize: '0.82rem', color: '#D1D5DB' }}>
                                  Restoring authoritative state {reconnectAttempt > 0 ? `(Attempt ${reconnectAttempt})` : ''}
                                </div>
                              </div>
                            )}

                            {(() => {
                              const ranks = userColor === 'w' ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8];
                              const files = userColor === 'w' ? ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] : ['h', 'g', 'f', 'e', 'd', 'c', 'b', 'a'];

                              return ranks.map((rank, rIdx) =>
                                files.map((file, fIdx) => {
                                  const squareName = `${file}${rank}`;
                                  const isLightSquare = (rIdx + fIdx) % 2 === 0;

                                  const bgSquareColor = isLightSquare ? '#F0D9B5' : '#B58863';

                                  const isSelected = selectedSquare === squareName;
                                  const isLegalTarget = legalSquares.includes(squareName);
                                  const isLastMove = lastMoveSquares.includes(squareName);

                                  const piece = chessRef.current.get(squareName);
                                  let pieceSvgKey = null;
                                  if (piece) {
                                    const pType = piece.type === 'p' ? 'p' : piece.type.toUpperCase();
                                    pieceSvgKey = `${piece.color}${pType}`;
                                  }

                                  return (
                                    <div
                                      key={squareName}
                                      onClick={() => handleSquareClick(squareName)}
                                      style={{
                                        backgroundColor: isSelected
                                          ? 'rgba(59, 130, 246, 0.55)'
                                          : isLastMove
                                            ? 'rgba(234, 179, 8, 0.35)'
                                            : bgSquareColor,
                                        position: 'relative',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        cursor: (piece && piece.color === userColor) || isLegalTarget ? 'pointer' : 'default',
                                        transition: 'background-color 0.15s ease'
                                      }}
                                    >
                                      {/* File / Rank Corner Coordinates Labels */}
                                      {fIdx === 0 && (
                                        <span style={{
                                          position: 'absolute',
                                          top: '2px',
                                          left: '3px',
                                          fontSize: '0.62rem',
                                          fontWeight: 900,
                                          color: isLightSquare ? '#B58863' : '#F0D9B5',
                                          pointerEvents: 'none'
                                        }}>
                                          {rank}
                                        </span>
                                      )}
                                      {rIdx === 7 && (
                                        <span style={{
                                          position: 'absolute',
                                          bottom: '2px',
                                          right: '3px',
                                          fontSize: '0.62rem',
                                          fontWeight: 900,
                                          color: isLightSquare ? '#B58863' : '#F0D9B5',
                                          pointerEvents: 'none'
                                        }}>
                                          {file.toUpperCase()}
                                        </span>
                                      )}

                                      {/* User Authentic Piece PNG Image */}
                                      {pieceSvgKey && (
                                        <img
                                          src={`/images/${pieceSvgKey}.png`}
                                          alt={pieceSvgKey}
                                          style={{
                                            width: '85%',
                                            height: '85%',
                                            objectFit: 'contain',
                                            zIndex: 2,
                                            pointerEvents: 'none',
                                            filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.35))'
                                          }}
                                        />
                                      )}

                                      {/* Legal Move Overlay Target Indicator */}
                                      {isLegalTarget && (
                                        <div style={{
                                          position: 'absolute',
                                          inset: 0,
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          zIndex: 3,
                                          pointerEvents: 'none'
                                        }}>
                                          {piece ? (
                                            <div style={{
                                              width: '88%',
                                              height: '88%',
                                              borderRadius: '50%',
                                              border: '3px solid rgba(239, 68, 68, 0.85)'
                                            }} />
                                          ) : (
                                            <div style={{
                                              width: '26%',
                                              height: '26%',
                                              borderRadius: '50%',
                                              backgroundColor: 'rgba(16, 185, 129, 0.8)'
                                            }} />
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })
                              );
                            })()}
                          </div>

                          {/* PLAYER CARD (BOTTOM) */}
                          {(() => {
                            const isUserTurn = chessRef.current.turn() === userColor;
                            return (
                              <div style={{
                                width: '100%',
                                backgroundColor: '#080808',
                                border: '1px solid #171717',
                                borderRadius: '10px',
                                padding: '0.3rem 0.75rem',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                boxShadow: '0 2px 10px rgba(0,0,0,0.5)',
                                boxSizing: 'border-box'
                              }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                                  <div style={{ position: 'relative', width: '32px', height: '32px', flexShrink: 0 }}>
                                    <img
                                      src="/pixel_avatar.jpg"
                                      alt="Your Avatar"
                                      style={{
                                        width: '32px',
                                        height: '32px',
                                        borderRadius: '7px',
                                        objectFit: 'cover',
                                        border: '1px solid #27272A'
                                      }}
                                    />
                                    {isUserTurn && !matchOutcome && (
                                      <span style={{
                                        position: 'absolute',
                                        bottom: '-2px',
                                        right: '-2px',
                                        width: '8px',
                                        height: '8px',
                                        borderRadius: '50%',
                                        backgroundColor: '#10B981',
                                        boxShadow: '0 0 6px #10B981'
                                      }} />
                                    )}
                                  </div>
                                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                      <span style={{ fontWeight: 800, fontSize: '0.88rem', color: '#FFFFFF', lineHeight: 1.1 }}>
                                        {name} (You)
                                      </span>
                                      <span style={{ fontSize: '0.78rem' }}>{userColor === 'w' ? '♔' : '♚'}</span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.05rem' }}>
                                      <span style={{
                                        fontSize: '0.68rem',
                                        fontWeight: 800,
                                        backgroundColor: '#121215',
                                        color: '#8E8E93',
                                        padding: '0.1rem 0.4rem',
                                        borderRadius: '4px'
                                      }}>
                                        {typeof rating === 'number'
                                          ? `${rating} ELO`
                                          : (effectiveProfile?.rating === null
                                            ? 'Unrated'
                                            : (effectiveProfile?.ratingError ? 'Rating Unavailable' : 'Loading ELO...'))}
                                      </span>
                                      {isUserTurn && !matchOutcome && (
                                        <span style={{ fontSize: '0.68rem', color: '#10B981', fontWeight: 700 }}>
                                          Your Turn
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                {/* TIMER BOX */}
                                <div style={{
                                  backgroundColor: isUserTurn && !matchOutcome ? '#18181D' : '#0D0D10',
                                  color: isUserTurn && !matchOutcome ? '#FFFFFF' : '#8E8E93',
                                  border: '1px solid #1A1A1D',
                                  borderRadius: '8px',
                                  padding: '0.25rem 0.6rem',
                                  fontFamily: "'Anton', monospace",
                                  fontSize: '1.15rem',
                                  letterSpacing: '1px',
                                  boxShadow: isUserTurn ? '0 0 10px rgba(16, 185, 129, 0.2)' : 'none',
                                  transition: 'all 0.2s ease',
                                  lineHeight: 1
                                }}>
                                  {formatTimer(userTimeLeft)}
                                </div>
                              </div>
                            );
                          })()}

                          {/* CAPTURED PIECES CARD */}
                          {(() => {
                            const { capturedWhite, capturedBlack, materialDiff } = getCapturedPieces();
                            const userCaptured = userColor === 'w' ? capturedBlack : capturedWhite;
                            const aiCaptured = userColor === 'w' ? capturedWhite : capturedBlack;

                            const userMaterialAdv = userColor === 'w' ? materialDiff : -materialDiff;

                            return (
                              <div style={{
                                width: '100%',
                                backgroundColor: '#080808',
                                border: '1px solid #171717',
                                borderRadius: '8px',
                                padding: '0.25rem 0.75rem',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                fontSize: '0.78rem',
                                boxSizing: 'border-box'
                              }}>
                                <span style={{ fontSize: '0.62rem', fontWeight: 800, color: '#8E8E93', letterSpacing: '0.8px' }}>
                                  CAPTURES
                                </span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                                  {/* User Captures */}
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.15rem', minHeight: '18px' }}>
                                    {userCaptured.length > 0 ? (
                                      userCaptured.map((p, idx) => {
                                        const oppColor = userColor === 'w' ? 'b' : 'w';
                                        const pKey = `${oppColor}${p === 'p' ? 'p' : p.toUpperCase()}`;
                                        return (
                                          <img
                                            key={idx}
                                            src={`/images/${pKey}.png`}
                                            alt={pKey}
                                            style={{ width: '18px', height: '18px', objectFit: 'contain' }}
                                          />
                                        );
                                      })
                                    ) : (
                                      <span style={{ fontSize: '0.7rem', color: '#52525B' }}>None</span>
                                    )}
                                    {userMaterialAdv > 0 && (
                                      <span style={{ fontWeight: 900, color: '#10B981', marginLeft: '0.25rem', fontSize: '0.75rem' }}>
                                        +{userMaterialAdv}
                                      </span>
                                    )}
                                  </div>

                                  <div style={{ width: '1px', height: '14px', backgroundColor: '#1A1A1D' }} />

                                  {/* AI Captures */}
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.15rem', minHeight: '18px' }}>
                                    {aiCaptured.length > 0 ? (
                                      aiCaptured.map((p, idx) => {
                                        const selfColor = userColor;
                                        const pKey = `${selfColor}${p === 'p' ? 'p' : p.toUpperCase()}`;
                                        return (
                                          <img
                                            key={idx}
                                            src={`/images/${pKey}.png`}
                                            alt={pKey}
                                            style={{ width: '18px', height: '18px', objectFit: 'contain' }}
                                          />
                                        );
                                      })
                                    ) : (
                                      <span style={{ fontSize: '0.7rem', color: '#52525B' }}>None</span>
                                    )}
                                    {userMaterialAdv < 0 && (
                                      <span style={{ fontWeight: 900, color: '#EF4444', marginLeft: '0.25rem', fontSize: '0.75rem' }}>
                                        +{Math.abs(userMaterialAdv)}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })()}
                        </div>

                        {/* GAME OVER MODAL */}
                        <AnimatePresence>
                          {matchOutcome && (
                            <motion.div
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              style={{
                                position: 'fixed',
                                inset: 0,
                                backgroundColor: 'rgba(0,0,0,0.85)',
                                backdropFilter: 'blur(8px)',
                                zIndex: 300,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: '1.25rem'
                              }}
                            >
                              <motion.div
                                initial={{ scale: 0.88, y: 20 }}
                                animate={{ scale: 1, y: 0 }}
                                exit={{ scale: 0.88, y: 20 }}
                                style={{
                                  backgroundColor: '#080808',
                                  border: '1px solid #1A1A1D',
                                  borderRadius: '24px',
                                  padding: '2rem',
                                  maxWidth: '420px',
                                  width: '100%',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  alignItems: 'center',
                                  textAlign: 'center',
                                  gap: '1.25rem',
                                  boxShadow: '0 24px 60px rgba(0,0,0,0.9)',
                                  color: '#FFFFFF'
                                }}
                              >
                                <div style={{
                                  width: '64px',
                                  height: '64px',
                                  borderRadius: '50%',
                                  backgroundColor: matchOutcome.winner === 'user' ? '#10B98120' : matchOutcome.winner === 'ai' ? '#EF444420' : '#F59E0B20',
                                  color: matchOutcome.winner === 'user' ? '#10B981' : matchOutcome.winner === 'ai' ? '#EF4444' : '#F59E0B',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center'
                                }}>
                                  {matchOutcome.winner === 'user' ? <Trophy size={36} /> : matchOutcome.winner === 'ai' ? <Flag size={36} /> : <Crown size={36} />}
                                </div>

                                <div>
                                  <h2 style={{
                                    fontFamily: "'Anton', 'Bebas Neue', sans-serif",
                                    fontSize: '2rem',
                                    margin: 0,
                                    letterSpacing: '0.02em',
                                    lineHeight: 1.1
                                  }}>
                                    {matchOutcome.title}
                                  </h2>
                                  <p style={{
                                    fontSize: '0.92rem',
                                    color: '#8E8E93',
                                    margin: '0.5rem 0 0 0',
                                    fontWeight: 500
                                  }}>
                                    {matchOutcome.reason}
                                  </p>
                                  {matchOutcome.ratingDelta !== null && matchOutcome.ratingDelta !== undefined && (
                                    <div style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '0.5rem',
                                      backgroundColor: '#121215',
                                      border: '1px solid #1A1A1D',
                                      padding: '0.45rem 1rem',
                                      borderRadius: '12px',
                                      marginTop: '0.85rem'
                                    }}>
                                      <span style={{ fontSize: '0.8rem', color: '#8E8E93', fontWeight: 800 }}>
                                        RATING:
                                      </span>
                                      <span style={{
                                        fontSize: '1rem',
                                        fontWeight: 900,
                                        color: matchOutcome.ratingDelta > 0 ? '#10B981' : matchOutcome.ratingDelta < 0 ? '#EF4444' : '#FFFFFF'
                                      }}>
                                        {matchOutcome.ratingDelta > 0 ? `+${matchOutcome.ratingDelta}` : matchOutcome.ratingDelta}
                                      </span>
                                      {matchOutcome.newRating && (
                                        <span style={{ fontSize: '0.85rem', color: '#8E8E93', fontWeight: 700 }}>
                                          ({matchOutcome.newRating} ELO)
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>

                                <div style={{
                                  display: 'flex',
                                  gap: '0.75rem',
                                  width: '100%',
                                  marginTop: '0.5rem'
                                }}>
                                  <button
                                    onClick={() => {
                                      if (gameMode === 'online') {
                                        setCurrentGameId(null);
                                        setGameMode('ai');
                                        setOpponentProfile(null);
                                        setMatchOutcome(null);
                                        setPlaySubMode('online');
                                      } else {
                                        startAIMatch();
                                      }
                                    }}
                                    style={{
                                      flex: 1,
                                      backgroundColor: '#FFFFFF',
                                      color: '#000000',
                                      border: 'none',
                                      borderRadius: '12px',
                                      padding: '0.9rem',
                                      fontWeight: 800,
                                      fontSize: '0.9rem',
                                      cursor: 'pointer'
                                    }}
                                  >
                                    PLAY AGAIN
                                  </button>
                                  <button
                                    onClick={() => {
                                      if (gameMode === 'online') {
                                        setCurrentGameId(null);
                                        setGameMode('ai');
                                        setOpponentProfile(null);
                                        setMatchOutcome(null);
                                        setPlaySubMode('main');
                                      } else {
                                        setPlaySubMode('bot');
                                      }
                                    }}
                                    style={{
                                      flex: 1,
                                      backgroundColor: '#141418',
                                      color: '#FFFFFF',
                                      border: '1px solid #1E1E22',
                                      borderRadius: '12px',
                                      padding: '0.9rem',
                                      fontWeight: 800,
                                      fontSize: '0.9rem',
                                      cursor: 'pointer'
                                    }}
                                  >
                                    CHANGE MODE
                                  </button>
                                </div>
                              </motion.div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )}

                  </div>
                )}

                {/* TAB 3: PUZZLES VIEW */}
                {activeTab === 'puzzles' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: '800px', margin: '0 auto', width: '100%' }}>
                    <div>
                      <h1 style={{ fontFamily: "'Anton', 'Bebas Neue', sans-serif", fontSize: '2.4rem', margin: 0 }}>TACTICS PUZZLES</h1>
                      <p style={{ color: isDarkMode ? '#9CA3AF' : '#6B7280', fontSize: '0.95rem', margin: '0.2rem 0 0 0' }}>Train your tactical pattern recognition with puzzles</p>
                    </div>

                    <PuzzlePlayer isDarkMode={isDarkMode} />
                  </div>
                )}

                {/* TAB 4: LEADERBOARD VIEW */}
                {activeTab === 'leaderboard' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: '800px', margin: '0 auto' }}>
                    <div>
                      <h1 style={{ fontFamily: "'Anton', 'Bebas Neue', sans-serif", fontSize: '2.4rem', margin: 0, color: '#FFFFFF' }}>GLOBAL LEADERBOARD</h1>
                      <p style={{ color: '#8E8E93', fontSize: '0.95rem', margin: '0.2rem 0 0 0' }}>Top Strategic Chess Players</p>
                    </div>

                    <div style={{
                      backgroundColor: '#080808',
                      border: '1px solid #171717',
                      borderRadius: '20px',
                      padding: '1rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.6rem',
                      boxShadow: '0 8px 30px rgba(0,0,0,0.5)'
                    }}>
                      {[
                        { rank: 1, name: 'Magnus C.', rating: 2882, title: 'GM' },
                        { rank: 2, name: 'Hikaru N.', rating: 2802, title: 'GM' },
                        { rank: 3, name: 'Fabiano C.', rating: 2795, title: 'GM' },
                        { rank: 4, name: name, rating: rating, title: rankInfo.title, isUser: true },
                        { rank: 5, name: 'Gukesh D.', rating: 2794, title: 'GM' }
                      ].map((player) => (
                        <div
                          key={player.rank}
                          style={{
                            backgroundColor: player.isUser ? '#141418' : '#0B0B0D',
                            border: player.isUser ? '1px solid rgba(255, 255, 255, 0.35)' : '1px solid #141416',
                            borderRadius: '12px',
                            padding: '0.9rem 1.1rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            color: '#FFFFFF'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                            <span style={{ fontWeight: 800, fontSize: '0.95rem', minWidth: '24px', color: '#8E8E93' }}>#{player.rank}</span>
                            <div>
                              <div style={{ fontWeight: 800, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#FFFFFF' }}>
                                <span>{player.name}</span>
                                {player.isUser && <span style={{ fontSize: '0.65rem', backgroundColor: '#FFFFFF', color: '#000000', padding: '0.1rem 0.45rem', borderRadius: '6px', fontWeight: 900 }}>YOU</span>}
                              </div>
                              <div style={{ fontSize: '0.72rem', color: '#8E8E93' }}>Rank: {player.title}</div>
                            </div>
                          </div>

                          <div style={{ fontWeight: 900, fontSize: '1.05rem', color: '#FFFFFF' }}>{player.rating} ELO</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* TAB 5: PROFILE VIEW */}
                {activeTab === 'profile' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: '800px', margin: '0 auto' }}>
                    <div>
                      <h1 style={{ fontFamily: "'Anton', 'Bebas Neue', sans-serif", fontSize: '2.4rem', margin: 0, color: '#FFFFFF' }}>MY PROFILE</h1>
                      <p style={{ color: '#8E8E93', fontSize: '0.95rem', margin: '0.2rem 0 0 0' }}>Account Details & Settings</p>
                    </div>

                    <div style={{
                      backgroundColor: '#080808',
                      border: '1px solid #171717',
                      borderRadius: '20px',
                      padding: '1.75rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '1.1rem',
                      boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
                      color: '#FFFFFF'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
                        <img
                          src="/pixel_avatar.jpg"
                          alt="Avatar"
                          style={{ width: '56px', height: '56px', borderRadius: '12px', imageRendering: 'pixelated', border: '1px solid #27272A' }}
                        />
                        <div>
                          <div style={{ fontSize: '1.3rem', fontWeight: 900, color: '#FFFFFF' }}>{name}</div>
                          <div style={{ fontSize: '0.8rem', color: '#8E8E93', fontWeight: 700 }}>{rankInfo.title} • {rating} ELO</div>
                        </div>
                      </div>

                      <div>
                        <span style={{ fontSize: '0.72rem', color: '#8E8E93', fontWeight: 800, letterSpacing: '1px' }}>EMAIL</span>
                        <div style={{ fontSize: '0.98rem', fontWeight: 600, marginTop: '2px', color: '#FFFFFF' }}>{user?.email || 'N/A'}</div>
                      </div>

                      <div>
                        <span style={{ fontSize: '0.72rem', color: '#8E8E93', fontWeight: 800, letterSpacing: '1px' }}>EXPERIENCE LEVEL</span>
                        <div style={{ fontSize: '1.05rem', fontWeight: 700, marginTop: '2px', color: '#FFFFFF' }}>{skill}</div>
                      </div>

                      <button
                        onClick={onLogout}
                        style={{
                          backgroundColor: 'rgba(239, 68, 68, 0.12)',
                          border: '1px solid rgba(239, 68, 68, 0.35)',
                          color: '#EF4444',
                          borderRadius: '12px',
                          padding: '0.9rem',
                          fontWeight: 800,
                          cursor: 'pointer',
                          marginTop: '0.5rem',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.5rem',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <LogOut size={17} />
                        <span>SIGN OUT</span>
                      </button>
                    </div>

                    {/* Phase 8: Authoritative Match History Card */}
                    <div style={{
                      backgroundColor: '#080808',
                      border: '1px solid #171717',
                      borderRadius: '20px',
                      padding: '1.75rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '1.1rem',
                      boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
                      color: '#FFFFFF'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                          <h3 style={{ fontFamily: "'Anton', 'Bebas Neue', sans-serif", fontSize: '1.5rem', margin: 0, letterSpacing: '0.02em', color: '#FFFFFF' }}>
                            MATCH HISTORY
                          </h3>
                          <p style={{ fontSize: '0.82rem', color: '#8E8E93', margin: '0.2rem 0 0 0' }}>
                            Authoritative Record of Completed Online Matches
                          </p>
                        </div>
                        <button
                          onClick={loadMatchHistory}
                          disabled={isLoadingHistory}
                          title="Refresh Match History"
                          style={{
                            backgroundColor: '#121215',
                            border: '1px solid #27272A',
                            borderRadius: '10px',
                            padding: '0.55rem',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#FFFFFF'
                          }}
                        >
                          <RefreshCw size={16} />
                        </button>
                      </div>

                      {isLoadingHistory ? (
                        <div style={{ padding: '2rem', textAlign: 'center', color: isDarkMode ? '#A1A1AA' : '#6B7280' }}>
                          <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 0.75rem' }} />
                          <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>Loading persistent match history...</div>
                        </div>
                      ) : historyError ? (
                        <div style={{
                          padding: '1.25rem',
                          borderRadius: '12px',
                          backgroundColor: isDarkMode ? '#271B1B' : '#FEF2F2',
                          border: isDarkMode ? '1px solid #7F1D1D' : '1px solid #FCA5A5',
                          color: '#EF4444',
                          fontSize: '0.88rem',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between'
                        }}>
                          <span>{historyError}</span>
                          <button
                            onClick={loadMatchHistory}
                            style={{
                              backgroundColor: '#EF4444',
                              color: '#FFFFFF',
                              border: 'none',
                              borderRadius: '8px',
                              padding: '0.4rem 0.8rem',
                              fontWeight: 700,
                              fontSize: '0.8rem',
                              cursor: 'pointer'
                            }}
                          >
                            Retry
                          </button>
                        </div>
                      ) : matchHistory.length === 0 ? (
                        <div style={{
                          padding: '2.5rem 1rem',
                          textAlign: 'center',
                          backgroundColor: isDarkMode ? '#121214' : '#F9FAFB',
                          borderRadius: '14px',
                          border: isDarkMode ? '1px dashed #27272A' : '1px dashed #E5E7EB'
                        }}>
                          <Swords size={32} style={{ color: isDarkMode ? '#52525B' : '#9CA3AF', margin: '0 auto 0.75rem' }} />
                          <div style={{ fontWeight: 800, fontSize: '1rem', color: isDarkMode ? '#E4E4E7' : '#374151' }}>
                            No Online Matches Recorded Yet
                          </div>
                          <p style={{ fontSize: '0.85rem', color: isDarkMode ? '#71717A' : '#6B7280', margin: '0.4rem 0 1rem 0' }}>
                            Play an online PvP match to earn Elo ratings and build your competitive history!
                          </p>
                          <button
                            onClick={() => {
                              setPlaySubMode('online');
                              handleTabChange('play');
                            }}
                            style={{
                              backgroundColor: isDarkMode ? '#FFFFFF' : '#000000',
                              color: isDarkMode ? '#000000' : '#FFFFFF',
                              border: 'none',
                              borderRadius: '10px',
                              padding: '0.65rem 1.25rem',
                              fontWeight: 800,
                              fontSize: '0.85rem',
                              cursor: 'pointer'
                            }}
                          >
                            PLAY ONLINE NOW
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                          {matchHistory.map((match) => {
                            const isWin = match.result === 'win';
                            const isLoss = match.result === 'loss';
                            const resultColor = isWin ? '#10B981' : isLoss ? '#EF4444' : '#F59E0B';
                            const resultBg = isWin ? '#10B98115' : isLoss ? '#EF444415' : '#F59E0B15';
                            const resultLabel = isWin ? 'WIN' : isLoss ? 'LOSS' : 'DRAW';

                            const formattedDate = match.completedAt
                              ? new Date(match.completedAt).toLocaleDateString(undefined, {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })
                              : 'Recent';

                            return (
                              <div
                                key={match.gameId}
                                style={{
                                  backgroundColor: isDarkMode ? '#1E1E22' : '#F9FAFB',
                                  border: isDarkMode ? '1px solid #27272A' : '1px solid #E5E7EB',
                                  borderRadius: '14px',
                                  padding: '1rem 1.15rem',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  gap: '1rem'
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                  <span style={{
                                    padding: '0.35rem 0.65rem',
                                    borderRadius: '8px',
                                    backgroundColor: resultBg,
                                    color: resultColor,
                                    fontWeight: 900,
                                    fontSize: '0.78rem',
                                    letterSpacing: '0.5px'
                                  }}>
                                    {resultLabel}
                                  </span>

                                  <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                      <span style={{
                                        width: '12px',
                                        height: '12px',
                                        borderRadius: '50%',
                                        backgroundColor: match.userColor === 'w' ? '#FFFFFF' : '#111111',
                                        border: '1px solid #71717A',
                                        display: 'inline-block'
                                      }} title={match.userColor === 'w' ? 'You played White' : 'You played Black'} />
                                      <span style={{ fontWeight: 800, fontSize: '0.98rem' }}>
                                        vs {match.opponent?.fullName || 'Chess Player'}
                                      </span>
                                      {match.opponent?.rating && (
                                        <span style={{ fontSize: '0.78rem', color: isDarkMode ? '#A1A1AA' : '#6B7280', fontWeight: 600 }}>
                                          ({match.opponent.rating} ELO)
                                        </span>
                                      )}
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: isDarkMode ? '#71717A' : '#9CA3AF', marginTop: '0.2rem' }}>
                                      {match.resultReason} • {match.timeControl} • {formattedDate}
                                    </div>
                                  </div>
                                </div>

                                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                  {match.ratingDelta !== null && match.ratingDelta !== undefined ? (
                                    <div>
                                      <div style={{
                                        fontWeight: 900,
                                        fontSize: '1.05rem',
                                        color: match.ratingDelta > 0 ? '#10B981' : match.ratingDelta < 0 ? '#EF4444' : (isDarkMode ? '#A1A1AA' : '#6B7280')
                                      }}>
                                        {match.ratingDelta > 0 ? `+${match.ratingDelta}` : match.ratingDelta}
                                      </div>
                                      {match.ratingAfter && (
                                        <div style={{ fontSize: '0.72rem', color: isDarkMode ? '#71717A' : '#9CA3AF', fontWeight: 600 }}>
                                          {match.ratingAfter} ELO
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <span style={{ fontSize: '0.78rem', color: isDarkMode ? '#71717A' : '#9CA3AF', fontWeight: 600 }}>
                                      Unrated
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* TAB: LEARN VIEW */}
                {activeTab === 'learn' && (
                  <LearnSection isDarkMode={isDarkMode} />
                )}

                {/* TAB: BOOKS VIEW */}
                {activeTab === 'books' && (
                  <BooksLibrary isDarkMode={isDarkMode} />
                )}

                {/* TAB: NEWS VIEW */}
                {activeTab === 'news' && (
                  <NewsFeed isDarkMode={isDarkMode} />
                )}

                {/* TAB: SETTINGS VIEW */}
                {activeTab === 'settings' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '800px' }}>
                    <div>
                      <h1 style={{ fontFamily: "'Anton', 'Bebas Neue', sans-serif", fontSize: '2.4rem', margin: 0, color: '#FFFFFF' }}>SETTINGS</h1>
                      <p style={{ color: '#8E8E93', fontSize: '0.95rem', margin: '0.2rem 0 0 0' }}>Preferences & Board Configuration</p>
                    </div>

                    <div style={{ backgroundColor: '#080808', border: '1px solid #171717', borderRadius: '16px', padding: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', boxShadow: '0 8px 30px rgba(0,0,0,0.5)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#FFFFFF' }}>Sound Effects</div>
                          <div style={{ fontSize: '0.8rem', color: '#8E8E93' }}>Play audio on piece moves & captures</div>
                        </div>
                        <input type="checkbox" defaultChecked style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#FFFFFF' }} />
                      </div>

                      <div style={{ height: '1px', backgroundColor: '#141416' }} />

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#FFFFFF' }}>Engine Depth</div>
                          <div style={{ fontSize: '0.8rem', color: '#8E8E93' }}>Python AI search depth level</div>
                        </div>
                        <select style={{ padding: '0.4rem 0.75rem', borderRadius: '8px', border: '1px solid #27272A', backgroundColor: '#121215', color: '#FFFFFF', fontWeight: 700 }}>
                          <option>Depth 3 (Fast)</option>
                          <option selected>Depth 5 (Balanced)</option>
                          <option>Depth 8 (Deep Search)</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </main>
        </div>

        {/* MOBILE FLOATING BOTTOM NAVIGATION BAR */}
        <div className="dash-mobile-flex" style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: '#000000',
          borderTop: '1px solid #141416',
          zIndex: 100,
          padding: '0.55rem 1rem 0.75rem 1rem',
          boxShadow: '0 -4px 20px rgba(0,0,0,0.8)',
          justifyContent: 'space-around',
          alignItems: 'center'
        }}>
          {[
            { id: 'home', label: 'Home', icon: LayoutDashboard },
            { id: 'play', label: 'Play', icon: Swords },
            { id: 'puzzles', label: 'Puzzles', icon: Puzzle },
            { id: 'leaderboard', label: 'Ranks', icon: Trophy },
            { id: 'profile', label: 'Profile', icon: User }
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  backgroundColor: isActive ? '#141418' : 'transparent',
                  color: isActive ? '#FFFFFF' : '#8E8E93',
                  border: isActive ? '1px solid rgba(255, 255, 255, 0.15)' : 'none',
                  borderRadius: '12px',
                  padding: '0.45rem 0.85rem',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '2px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                <Icon size={18} />
                <span style={{ fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.5px' }}>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* RATING ANALYTICS MODAL */}
      <AnimatePresence>
        {showAnalyticsModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowAnalyticsModal(false)}
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0,0,0,0.8)',
              backdropFilter: 'blur(6px)',
              zIndex: 200,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '1.25rem'
            }}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              style={{
                backgroundColor: '#080808',
                border: '1px solid #171717',
                borderRadius: '24px',
                padding: '1.75rem',
                maxWidth: '440px',
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                gap: '1.25rem',
                color: '#FFFFFF',
                boxShadow: '0 20px 50px rgba(0,0,0,0.8)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ fontFamily: "'Anton', 'Bebas Neue', sans-serif", fontSize: '1.9rem', margin: 0, color: '#FFFFFF' }}>RATING ANALYTICS</h2>
                <button onClick={() => setShowAnalyticsModal(false)} style={{ background: 'none', border: 'none', color: '#A1A1AA', cursor: 'pointer' }}>
                  <X size={22} />
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
                <div style={{ backgroundColor: '#0D0D10', border: '1px solid #1A1A1D', borderRadius: '14px', padding: '1rem' }}>
                  <div style={{ fontSize: '0.7rem', color: '#8E8E93', fontWeight: 800 }}>CURRENT ELO</div>
                  <div style={{ fontSize: '1.7rem', fontWeight: 900, marginTop: '2px', color: '#FFFFFF' }}>{rating}</div>
                </div>

                <div style={{ backgroundColor: '#0D0D10', border: '1px solid #1A1A1D', borderRadius: '14px', padding: '1rem' }}>
                  <div style={{ fontSize: '0.7rem', color: '#8E8E93', fontWeight: 800 }}>WIN RATE</div>
                  <div style={{ fontSize: '1.7rem', fontWeight: 900, color: '#10B981', marginTop: '2px' }}>68%</div>
                </div>
              </div>

              <div style={{ fontSize: '0.88rem', color: '#A1A1AA', lineHeight: 1.5 }}>
                🏆 You are currently in the top 15% of players in the {rankInfo.title} tier! Keep playing engine matches to reach {rankInfo.nextElo} ELO.
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* PUZZLE SOLVER MODAL */}
      <AnimatePresence>
        {showPuzzleModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowPuzzleModal(false)}
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0,0,0,0.8)',
              backdropFilter: 'blur(6px)',
              zIndex: 200,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '1.25rem'
            }}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              style={{
                backgroundColor: '#080808',
                border: '1px solid #171717',
                color: '#FFFFFF',
                borderRadius: '24px',
                padding: '1.75rem',
                maxWidth: '440px',
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                gap: '1.25rem',
                boxShadow: '0 20px 50px rgba(0,0,0,0.8)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#8E8E93', letterSpacing: '1px' }}>DAILY TACTICS</span>
                  <h2 style={{ fontFamily: "'Anton', 'Bebas Neue', sans-serif", fontSize: '1.85rem', margin: 0, color: '#FFFFFF' }}>WHITE TO MOVE: MATE IN 2</h2>
                </div>
                <button onClick={() => setShowPuzzleModal(false)} style={{ background: 'none', border: 'none', color: '#A1A1AA', cursor: 'pointer' }}>
                  <X size={22} />
                </button>
              </div>

              {/* Interactive Tactical Board (Preserving Established Chessboard Colors #2A2D35 / #1B1D22) */}
              <div style={{
                aspectRatio: '1',
                width: '100%',
                backgroundColor: '#000000',
                borderRadius: '16px',
                padding: '8px',
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gridTemplateRows: 'repeat(4, 1fr)',
                gap: '3px',
                border: '1px solid #1A1A1D'
              }}>
                {[...Array(16)].map((_, i) => {
                  const isWhite = (Math.floor(i / 4) + (i % 4)) % 2 === 0;
                  return (
                    <motion.div
                      key={i}
                      whileHover={{ scale: 0.95 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => {
                        if (i === 2) {
                          recordMatchPlayed();
                          setPuzzleSolved(true);
                          alert('🎉 Correct Move! Queen to H7 Checkmate! (+15 ELO)');
                          setShowPuzzleModal(false);
                        } else {
                          alert('❌ Incorrect move. Try finding Queen to H7 mate!');
                        }
                      }}
                      style={{
                        backgroundColor: isWhite ? '#2A2D35' : '#1B1D22',
                        borderRadius: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '2rem',
                        cursor: 'pointer',
                        userSelect: 'none'
                      }}
                    >
                      {i === 2 && '♛'}
                      {i === 7 && '♚'}
                      {i === 13 && '♞'}
                    </motion.div>
                  );
                })}
              </div>

              <div style={{ fontSize: '0.85rem', color: '#8E8E93', textAlign: 'center', fontStyle: 'italic' }}>
                Tap the Queen (♛) to play the winning checkmate move!
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
