import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Chess } from 'chess.js';
import { 
  RotateCcw, ArrowRight, ArrowLeft, CheckCircle2, AlertCircle, 
  Trophy, Tag, Sparkles 
} from 'lucide-react';
import puzzlesData from '../data/puzzles.json';

// Helper to convert UCI string (e.g. "e2e4", "e7e8q") into object
function parseUciMove(uci) {
  if (!uci || typeof uci !== 'string' || uci.length < 4) return null;
  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  const promotion = uci.length === 5 ? uci[4].toLowerCase() : undefined;
  return { from, to, promotion };
}

export default function PuzzlePlayer({ isDarkMode = true }) {
  const [puzzleIndex, setPuzzleIndex] = useState(0);
  const [boardFen, setBoardFen] = useState('');
  const [expectedMoveIndex, setExpectedMoveIndex] = useState(1);
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [legalSquares, setLegalSquares] = useState([]);
  const [lastMoveSquares, setLastMoveSquares] = useState([]);
  const [playerColor, setPlayerColor] = useState('w');
  const [status, setStatus] = useState('initializing'); // 'initializing' | 'ready' | 'opponent_responding' | 'solved' | 'error'
  const [feedback, setFeedback] = useState('Loading puzzle...');
  const [feedbackType, setFeedbackType] = useState('neutral'); // 'neutral' | 'error' | 'success' | 'info'
  const [errorMessage, setErrorMessage] = useState(null);

  // Authoritative chess instance stored in ref to prevent stale closures and extra re-renders
  const chessRef = useRef(null);
  const timerRef = useRef(null);

  // Clear any pending timers when unmounting or loading new puzzle
  const clearPendingTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Initialize a puzzle
  const loadPuzzle = useCallback((index) => {
    clearPendingTimer();
    setSelectedSquare(null);
    setLegalSquares([]);
    setLastMoveSquares([]);
    setErrorMessage(null);

    const puzzle = puzzlesData[index];
    if (!puzzle) {
      setStatus('error');
      setErrorMessage(`Puzzle at index ${index} not found.`);
      return;
    }

    try {
      const chess = new Chess(puzzle.fen);
      chessRef.current = chess;

      if (!Array.isArray(puzzle.moves) || puzzle.moves.length < 2) {
        throw new Error(`Puzzle ${puzzle.id} move sequence has insufficient moves.`);
      }

      // 1. Play opponent's automatic setup move (moves[0])
      const m0 = parseUciMove(puzzle.moves[0]);
      if (!m0) throw new Error(`Invalid setup move: ${puzzle.moves[0]}`);

      const res0 = chess.move({
        from: m0.from,
        to: m0.to,
        promotion: m0.promotion
      });

      if (!res0) {
        throw new Error(`Opponent setup move ${puzzle.moves[0]} is illegal in FEN ${puzzle.fen}`);
      }

      // 2. The solver's turn is the current turn after the setup move
      const solverTurn = chess.turn();
      setPlayerColor(solverTurn);
      setBoardFen(chess.fen());
      setLastMoveSquares([m0.from, m0.to]);
      setExpectedMoveIndex(1); // Next expected move is solver's move (moves[1])
      setStatus('ready');
      setFeedback(solverTurn === 'w' ? 'White to move. Find the best move!' : 'Black to move. Find the best move!');
      setFeedbackType('neutral');
    } catch (err) {
      console.error(`Failed to initialize puzzle ${puzzle.id}:`, err);
      setStatus('error');
      setErrorMessage(`Error initializing puzzle ${puzzle.id}: ${err.message}`);
    }
  }, [clearPendingTimer]);

  // Load puzzle whenever index changes
  useEffect(() => {
    loadPuzzle(puzzleIndex);
    return () => clearPendingTimer();
  }, [puzzleIndex, loadPuzzle, clearPendingTimer]);

  const currentPuzzle = puzzlesData[puzzleIndex] || null;

  // Handle Square Selection and Moves
  const handleSquareClick = (square) => {
    if (status !== 'ready' || !chessRef.current) return;
    const chess = chessRef.current;

    // If square is already selected, deselect
    if (selectedSquare === square) {
      setSelectedSquare(null);
      setLegalSquares([]);
      return;
    }

    const clickedPiece = chess.get(square);

    // If no piece is selected yet
    if (!selectedSquare) {
      if (clickedPiece && clickedPiece.color === playerColor) {
        setSelectedSquare(square);
        const moves = chess.moves({ square, verbose: true });
        setLegalSquares(moves.map(m => m.to));
      }
      return;
    }

    // A piece is already selected. If user clicks another piece of their own color, change selection
    if (clickedPiece && clickedPiece.color === playerColor) {
      setSelectedSquare(square);
      const moves = chess.moves({ square, verbose: true });
      setLegalSquares(moves.map(m => m.to));
      return;
    }

    // Otherwise, user is attempting a move from selectedSquare to square
    const from = selectedSquare;
    const to = square;

    // Check if this move is a legal move on the board
    const movesFromSelected = chess.moves({ square: from, verbose: true });
    const matchingLegalMove = movesFromSelected.find(m => m.to === to);

    if (!matchingLegalMove) {
      // Not a legal destination, cancel selection
      setSelectedSquare(null);
      setLegalSquares([]);
      return;
    }

    // Determine promotion if required
    let userPromotion;
    const piece = chess.get(from);
    if (piece && piece.type === 'p') {
      const isPromoRank = (piece.color === 'w' && to[1] === '8') || (piece.color === 'b' && to[1] === '1');
      if (isPromoRank) {
        userPromotion = 'q'; // default promotion choice
      }
    }

    // Verify against the expected solution move in the dataset
    const expectedUci = currentPuzzle.moves[expectedMoveIndex];
    const expectedParsed = parseUciMove(expectedUci);

    const isCorrectMove = expectedParsed && 
      expectedParsed.from === from && 
      expectedParsed.to === to &&
      (!expectedParsed.promotion || expectedParsed.promotion === (userPromotion || matchingLegalMove.promotion || 'q'));

    if (isCorrectMove) {
      // 1. Play the move on authoritative chess instance
      const moveRes = chess.move({
        from,
        to,
        promotion: expectedParsed.promotion || userPromotion || matchingLegalMove.promotion
      });

      if (!moveRes) {
        console.error('Move failed in chess.js despite matching:', expectedUci);
        return;
      }

      setBoardFen(chess.fen());
      setLastMoveSquares([from, to]);
      setSelectedSquare(null);
      setLegalSquares([]);

      const nextExpectedIdx = expectedMoveIndex + 1;

      // 2. Check if puzzle is solved
      if (nextExpectedIdx >= currentPuzzle.moves.length) {
        setStatus('solved');
        setFeedback('🎉 Puzzle Solved! Brilliant tactic!');
        setFeedbackType('success');
      } else {
        // 3. Opponent response is expected
        setExpectedMoveIndex(nextExpectedIdx);
        setStatus('opponent_responding');
        setFeedback('Correct! Opponent is responding...');
        setFeedbackType('info');

        // Schedule opponent response after short delay (600ms)
        clearPendingTimer();
        timerRef.current = setTimeout(() => {
          if (!chessRef.current) return;
          const oppUci = currentPuzzle.moves[nextExpectedIdx];
          const oppParsed = parseUciMove(oppUci);

          if (oppParsed) {
            const oppRes = chessRef.current.move({
              from: oppParsed.from,
              to: oppParsed.to,
              promotion: oppParsed.promotion
            });

            if (oppRes) {
              setBoardFen(chessRef.current.fen());
              setLastMoveSquares([oppParsed.from, oppParsed.to]);
              setExpectedMoveIndex(nextExpectedIdx + 1);
              setStatus('ready');
              setFeedback('Your turn! Find the next move.');
              setFeedbackType('neutral');
            } else {
              console.error('Opponent response failed legality:', oppUci);
              setStatus('error');
              setErrorMessage(`Opponent move ${oppUci} was illegal.`);
            }
          }
        }, 650);
      }
    } else {
      // Incorrect move attempt
      setSelectedSquare(null);
      setLegalSquares([]);
      setFeedback('❌ Incorrect move. Try again!');
      setFeedbackType('error');
    }
  };

  const handleRetry = () => {
    loadPuzzle(puzzleIndex);
  };

  const handleNextPuzzle = () => {
    setPuzzleIndex((prev) => (prev + 1) % puzzlesData.length);
  };

  const handlePrevPuzzle = () => {
    setPuzzleIndex((prev) => (prev - 1 + puzzlesData.length) % puzzlesData.length);
  };

  if (status === 'error' && errorMessage) {
    return (
      <div style={{
        backgroundColor: '#080808',
        color: '#FFFFFF',
        borderRadius: '20px',
        padding: '2rem',
        border: '1px solid #EF4444',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '1rem',
        maxWidth: '600px',
        margin: '0 auto'
      }}>
        <AlertCircle size={40} color="#EF4444" />
        <h2 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Puzzle Loading Error</h2>
        <p style={{ color: '#8E8E93' }}>{errorMessage}</p>
        <button
          onClick={handleNextPuzzle}
          style={{
            backgroundColor: '#FFFFFF',
            color: '#000000',
            border: 'none',
            borderRadius: '10px',
            padding: '0.6rem 1.2rem',
            fontWeight: 700,
            cursor: 'pointer'
          }}
        >
          Try Next Puzzle
        </button>
      </div>
    );
  }

  // Board square coordinates based on player orientation
  const ranks = playerColor === 'w' ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8];
  const files = playerColor === 'w' ? ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] : ['h', 'g', 'f', 'e', 'd', 'c', 'b', 'a'];

  const feedbackColors = {
    neutral: '#E5E7EB',
    info: '#60A5FA',
    error: '#EF4444',
    success: '#10B981'
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '1.25rem',
      maxWidth: '780px',
      margin: '0 auto',
      width: '100%',
      boxSizing: 'border-box'
    }}>
      {/* HEADER SECTION */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        backgroundColor: '#080808',
        border: '1px solid #171717',
        borderRadius: '20px',
        padding: '1.25rem 1.5rem',
        boxShadow: '0 8px 30px rgba(0,0,0,0.6)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{
              fontSize: '0.8rem',
              fontWeight: 800,
              letterSpacing: '1px',
              color: '#8E8E93'
            }}>
              PUZZLE #{currentPuzzle?.id || '—'}
            </span>
            <span style={{
              fontSize: '0.75rem',
              fontWeight: 700,
              color: '#52525B'
            }}>
              ({puzzleIndex + 1} of {puzzlesData.length})
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{
              backgroundColor: '#121215',
              border: '1px solid #1A1A1D',
              color: '#FFFFFF',
              padding: '0.3rem 0.8rem',
              borderRadius: '12px',
              fontSize: '0.8rem',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem'
            }}>
              <Trophy size={14} color="#FBBF24" />
              Rating {currentPuzzle?.rating || '—'}
            </span>
          </div>
        </div>

        {/* Themes tags */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center' }}>
          <Tag size={13} color="#8E8E93" />
          {currentPuzzle?.themes?.map((theme, i) => (
            <span
              key={i}
              style={{
                backgroundColor: '#121215',
                border: '1px solid #1A1A1D',
                color: '#D1D5DB',
                fontSize: '0.72rem',
                fontWeight: 600,
                padding: '0.2rem 0.55rem',
                borderRadius: '8px',
                textTransform: 'capitalize'
              }}
            >
              {theme}
            </span>
          ))}
        </div>
      </div>

      {/* CHESSBOARD CONTAINER */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '1rem',
        backgroundColor: '#080808',
        border: '1px solid #171717',
        borderRadius: '20px',
        padding: '1.25rem',
        boxShadow: '0 12px 35px rgba(0,0,0,0.7)'
      }}>
        {/* Dynamic Feedback Banner */}
        <div style={{
          width: '100%',
          padding: '0.75rem 1rem',
          borderRadius: '12px',
          backgroundColor: '#0C0C0E',
          border: '1px solid #171717',
          borderLeft: `4px solid ${feedbackColors[feedbackType]}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxSizing: 'border-box'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            {feedbackType === 'success' && <CheckCircle2 size={18} color="#10B981" />}
            {feedbackType === 'error' && <AlertCircle size={18} color="#EF4444" />}
            {feedbackType === 'info' && <Sparkles size={18} color="#60A5FA" />}
            <span style={{
              fontWeight: 700,
              fontSize: '0.92rem',
              color: feedbackColors[feedbackType]
            }}>
              {feedback}
            </span>
          </div>

          <span style={{
            fontSize: '0.75rem',
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            color: '#8E8E93'
          }}>
            Playing as {playerColor === 'w' ? 'White' : 'Black'}
          </span>
        </div>

        {/* 8x8 Chessboard */}
        <div style={{
          width: '100%',
          maxWidth: '560px',
          aspectRatio: '1',
          backgroundColor: '#000000',
          border: '2px solid #1A1A1D',
          borderRadius: '14px',
          overflow: 'hidden',
          display: 'grid',
          gridTemplateColumns: 'repeat(8, 1fr)',
          gridTemplateRows: 'repeat(8, 1fr)',
          position: 'relative',
          userSelect: 'none',
          boxShadow: '0 16px 45px rgba(0,0,0,0.85)'
        }}>
          {chessRef.current && ranks.map((rank, rIdx) =>
            files.map((file, fIdx) => {
              const squareName = `${file}${rank}`;
              const isLightSquare = (rIdx + fIdx) % 2 === 0;

              // Restore exact original board square colors: #F0D9B5 (light) and #B58863 (dark)
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
                    cursor: (status === 'ready' && ((piece && piece.color === playerColor) || isLegalTarget))
                      ? 'pointer'
                      : 'default',
                    transition: 'background-color 0.15s ease'
                  }}
                >
                  {/* Rank / File Coordinate Labels */}
                  {fIdx === 0 && (
                    <span style={{
                      position: 'absolute',
                      top: '2px',
                      left: '4px',
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
                      right: '4px',
                      fontSize: '0.62rem',
                      fontWeight: 900,
                      color: isLightSquare ? '#B58863' : '#F0D9B5',
                      pointerEvents: 'none'
                    }}>
                      {file.toUpperCase()}
                    </span>
                  )}

                  {/* Piece Graphic */}
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
                        filter: isDarkMode ? 'drop-shadow(0 2px 5px rgba(0,0,0,0.65))' : 'drop-shadow(0 2px 4px rgba(0,0,0,0.25))'
                      }}
                    />
                  )}

                  {/* Legal Move Indicators */}
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
                          width: '85%',
                          height: '85%',
                          borderRadius: '50%',
                          border: '4px solid rgba(239, 68, 68, 0.75)'
                        }} />
                      ) : (
                        <div style={{
                          width: '28%',
                          height: '28%',
                          borderRadius: '50%',
                          backgroundColor: 'rgba(16, 185, 129, 0.75)'
                        }} />
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* CONTROLS BAR */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: '100%',
          maxWidth: '560px',
          gap: '0.75rem',
          flexWrap: 'wrap'
        }}>
          <button
            onClick={handlePrevPuzzle}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              backgroundColor: '#141418',
              color: '#FFFFFF',
              border: '1px solid #1E1E22',
              borderRadius: '12px',
              padding: '0.7rem 1.1rem',
              fontWeight: 700,
              fontSize: '0.88rem',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            <ArrowLeft size={16} />
            Prev
          </button>

          <button
            onClick={handleRetry}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              backgroundColor: '#141418',
              color: '#FFFFFF',
              border: '1px solid #1E1E22',
              borderRadius: '12px',
              padding: '0.7rem 1.1rem',
              fontWeight: 700,
              fontSize: '0.88rem',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            <RotateCcw size={16} />
            Retry
          </button>

          <button
            onClick={handleNextPuzzle}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              backgroundColor: '#FFFFFF',
              color: '#000000',
              border: 'none',
              borderRadius: '12px',
              padding: '0.7rem 1.25rem',
              fontWeight: 800,
              fontSize: '0.88rem',
              cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(255,255,255,0.15)',
              transition: 'all 0.15s ease'
            }}
          >
            Next Puzzle
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
