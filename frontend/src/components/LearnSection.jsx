import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Chess } from 'chess.js';
import { 
  ArrowLeft, RotateCcw, CheckCircle2, AlertCircle, 
  HelpCircle, ChevronRight, ChevronLeft, Check, Lock, Trophy
} from 'lucide-react';

const LESSON_PROGRESS_KEY = 'strategic_chess_learn_progress';

// 5 Distinct, verified Rule of the Square Practice Exercises
const PRACTICE_EXERCISES = [
  {
    id: 1,
    title: "Exercise 1 of 5: The Flank Pawn Advance",
    subtitle: "Pawn on rank 4 vs a kingside King",
    fen: '8/8/8/5k2/P7/8/8/7K w - - 0 1',
    from: 'a4',
    to: 'a5',
    san: 'a5',
    conceptTip: "The pawn needs 4 moves to queen. Calculate the 4x4 square extending from files a through e.",
    hint1: "A King move does not shrink the pawn's square. Which piece must move to maintain the win?",
    hint2: "Push your passed pawn to a5! This immediately shrinks the square to file d, shutting out Black's King.",
    successExplanation: "1. a5 shrinks the square to files a through d (bounded by a5, d5, d8, a8). Black's King on f5 is two files away from the d-file boundary and cannot catch the pawn!"
  },
  {
    id: 2,
    title: "Exercise 2 of 5: The 2nd-Rank Double Step",
    subtitle: "Pawn on starting square (h2) vs queenside King",
    fen: '8/8/8/1k6/8/8/7P/7K w - - 0 1',
    from: 'h2',
    to: 'h4',
    san: 'h4',
    conceptTip: "Pawns on the 2nd rank can jump two squares. Calculate whether a 1-step or 2-step move is required.",
    hint1: "A single step (1. h3?) is too slow: Black plays 1... Kc5 and easily steps into the 5x5 square.",
    hint2: "Use the pawn's initial double-step privilege: play 1. h4 to leap two squares forward!",
    successExplanation: "1. h4 leaps two squares! The square immediately establishes from h4 to h8 (files d–h, ranks 4–8). Black's King on b5 is two files away from file d and cannot enter in time."
  },
  {
    id: 3,
    title: "Exercise 3 of 5: Center-Flank Separation",
    subtitle: "Queenside c-pawn racing a distant kingside King",
    fen: '8/8/8/7k/2P5/8/8/7K w - - 0 1',
    from: 'c4',
    to: 'c5',
    san: 'c5',
    conceptTip: "From c4, 4 steps to queen reaches file g. Black's King is lurking on h5.",
    hint1: "Black on h5 is just one file outside the g-file boundary. Any delay lets Black step in.",
    hint2: "Push the c-pawn to c5! This contracts the boundary from file g to file f, locking Black out.",
    successExplanation: "1. c5 immediately contracts the square to files c through f (c5, f5, f8, c8). Black's King on h5 cannot step inside on its move, guaranteeing an unaided queen."
  },
  {
    id: 4,
    title: "Exercise 4 of 5: The 5th-Rank Sprint",
    subtitle: "Advanced pawn on f5 with only 3 steps to queen",
    fen: '8/8/1k6/5P2/8/8/8/K7 w - - 0 1',
    from: 'f5',
    to: 'f6',
    san: 'f6',
    conceptTip: "From f5, the pawn needs 3 moves to queen (f6, f7, f8). The square is 3x3 (files c–f, ranks 5–8).",
    hint1: "Black's King on b6 is hovering just one square outside file c. A King move allows 1... Kc6! entering the square.",
    hint2: "Push the passed pawn to f6 immediately! This shrinks the boundary from file c to file d.",
    successExplanation: "1. f6 shrinks the square to files d through f (ranks 6–8). Black's King on b6 is two files outside the d-file boundary and cannot catch the pawn."
  },
  {
    id: 5,
    title: "Exercise 5 of 5: Opposite-Flank Mastery",
    subtitle: "b-pawn racing a King rushing across the board",
    fen: '8/8/6k1/8/1P6/8/8/7K w - - 0 1',
    from: 'b4',
    to: 'b5',
    san: 'b5',
    conceptTip: "Count the square: from b4, 4 steps to queen reaches the f-file. Black's King is on g6.",
    hint1: "Black on g6 is one file outside file f. Moving the King gives up the theoretical win.",
    hint2: "Push the b-pawn to b5! This contracts the boundary to the e-file, leaving Black stranded.",
    successExplanation: "1. b5 shrinks the square to files b through e (ranks 5–8). Black's King on g6 is two files outside the e-file and cannot catch the pawn before it promotes on b8!"
  }
];

// Stage 3 Guided Review Plies with Decoupled Answer Positions
const GUIDED_PLIES = [
  {
    plyIndex: 0,
    boardFen: '8/8/8/5k2/P7/8/8/7K w - - 0 1',
    title: "Move 1 — White to Move",
    prompt: "White to move: How does White maintain the win and shrink the square?",
    correctId: 'B',
    options: [
      { id: 'A', text: "1. Kg2", correct: false, explanation: "1. Kg2? wastes a vital tempo! The pawn remains on a4, allowing Black's King to step inside the square with 1... Ke5." },
      { id: 'B', text: "1. a5", correct: true, explanation: "1. a5 pushes the pawn, shrinking the square to files a–d. Black on f5 is two files away from the boundary." }
    ],
    resultingFen: '8/8/8/P4k2/8/8/8/7K b - - 0 1',
    resultingMove: ['a4', 'a5']
  },
  {
    plyIndex: 1,
    boardFen: '8/8/8/P4k2/8/8/8/7K b - - 0 1',
    title: "Move 1... Black to Move",
    prompt: "Black to move: Black must sprint toward the queenside. What is Black's best attempt?",
    correctId: 'A',
    options: [
      { id: 'A', text: "1... Ke6", correct: true, explanation: "1... Ke6 rushes along the diagonal toward the pawn. Black reaches the e-file, but the square is now bounded by the d-file." },
      { id: 'B', text: "1... Kg5", correct: false, explanation: "1... Kg5 walks toward the kingside, away from the pawn, giving up the chase entirely!" }
    ],
    resultingFen: '8/8/4k3/P7/8/8/8/7K w - - 1 2',
    resultingMove: ['f5', 'e6']
  },
  {
    plyIndex: 2,
    boardFen: '8/8/4k3/P7/8/8/8/7K w - - 1 2',
    title: "Move 2 — White to Move",
    prompt: "White to move: The square is currently bounded by file d. How does White keep Black out?",
    correctId: 'B',
    options: [
      { id: 'A', text: "2. Kg2", correct: false, explanation: "2. Kg2? gives Black time to step into the d-file boundary with 2... Kd7." },
      { id: 'B', text: "2. a6", correct: true, explanation: "2. a6 shrinks the square further to files a through c (a6, c6, c8, a8). Black is still outside!" }
    ],
    resultingFen: '8/8/P3k3/8/8/8/8/7K b - - 0 2',
    resultingMove: ['a5', 'a6']
  },
  {
    plyIndex: 3,
    boardFen: '8/8/P3k3/8/8/8/8/7K b - - 0 2',
    title: "Move 2... Black to Move",
    prompt: "Black to move: Black continues chasing the pawn. What is Black's best try?",
    correctId: 'B',
    options: [
      { id: 'A', text: "2... Kf7", correct: false, explanation: "2... Kf7 retreats away from the pawn, abandoning the race." },
      { id: 'B', text: "2... Kd7", correct: true, explanation: "2... Kd7 steps to the d-file, but the square is now bounded by file c. Black is still one step behind!" }
    ],
    resultingFen: '8/3k4/P7/8/8/8/8/7K w - - 1 3',
    resultingMove: ['e6', 'd7']
  },
  {
    plyIndex: 4,
    boardFen: '8/3k4/P7/8/8/8/8/7K w - - 1 3',
    title: "Move 3 — White to Move",
    prompt: "White to move: One square from the 7th rank! How does White press forward?",
    correctId: 'A',
    options: [
      { id: 'A', text: "3. a7", correct: true, explanation: "3. a7 reaches the 7th rank! The square shrinks to just files a and b." },
      { id: 'B', text: "3. Kh2", correct: false, explanation: "3. Kh2? gives Black time to reach c6 and round up the pawn." }
    ],
    resultingFen: '8/P2k4/8/8/8/8/8/7K b - - 0 3',
    resultingMove: ['a6', 'a7']
  },
  {
    plyIndex: 5,
    boardFen: '8/P2k4/8/8/8/8/8/7K b - - 0 3',
    title: "Move 3... Black to Move",
    prompt: "Black to move: Black's King makes one final sprint. Where can it move?",
    correctId: 'B',
    options: [
      { id: 'A', text: "3... Ke7", correct: false, explanation: "3... Ke7 moves away from the promotion square." },
      { id: 'B', text: "3... Kc7", correct: true, explanation: "3... Kc7 reaches the c-file, but cannot stop White from queening on the next move." }
    ],
    resultingFen: '8/P1k5/8/8/8/8/8/7K w - - 1 4',
    resultingMove: ['d7', 'c7']
  },
  {
    plyIndex: 6,
    boardFen: '8/P1k5/8/8/8/8/8/7K w - - 1 4',
    title: "Move 4 — White to Move (Decisive Promotion)",
    prompt: "The decisive move: Which promotion wins the game?",
    correctId: 'B',
    options: [
      { id: 'A', text: "4. a8=N+", correct: false, explanation: "4. a8=N+ underpromotes to a Knight! A lone King and Knight cannot force checkmate—this throws away the win into an immediate theoretical draw!" },
      { id: 'B', text: "4. a8=Q", correct: true, explanation: "4. a8=Q promotes safely to Queen! Black's King on c7 cannot reach a8. White has a decisive Queen vs lone King win." }
    ],
    resultingFen: 'Q7/2k5/8/8/8/8/8/7K b - - 0 4',
    resultingMove: ['a7', 'a8']
  }
];

// Helper: load progress cleanly with backward compatibility
function getStoredProgress() {
  try {
    const raw = localStorage.getItem(LESSON_PROGRESS_KEY);
    if (!raw) return { stage1Answered: false, practiceSolvedCount: 0, completed: false };
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const isLegacyDone = parsed.includes('endgame-mastery');
      return {
        stage1Answered: isLegacyDone,
        practiceSolvedCount: isLegacyDone ? 5 : 0,
        completed: isLegacyDone
      };
    }
    const data = parsed['endgame-mastery'] || {};
    const completed = Boolean(data.completed);
    let practiceSolvedCount = 0;
    if (completed || data.stage2Solved) {
      practiceSolvedCount = 5;
    } else if (Number.isInteger(data.practiceSolvedCount)) {
      practiceSolvedCount = Math.min(5, Math.max(0, data.practiceSolvedCount));
    }
    const stage1Answered = Boolean(data.stage1Answered || practiceSolvedCount > 0 || completed);
    return { stage1Answered, practiceSolvedCount, completed };
  } catch (e) {
    return { stage1Answered: false, practiceSolvedCount: 0, completed: false };
  }
}

// Helper: save progress cleanly
function saveStoredProgress(updatedFields) {
  try {
    let existingObj = {};
    const raw = localStorage.getItem(LESSON_PROGRESS_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed) && typeof parsed === 'object') {
          existingObj = parsed;
        }
      } catch (e) {}
    }
    const current = existingObj['endgame-mastery'] || {};
    const updated = { ...current, ...updatedFields };
    existingObj['endgame-mastery'] = updated;
    localStorage.setItem(LESSON_PROGRESS_KEY, JSON.stringify(existingObj));
  } catch (e) {}
}

export default function LearnSection({ isDarkMode = true }) {
  const location = useLocation();
  const navigate = useNavigate();

  const isLessonActive = location.pathname.includes('endgame-mastery') || location.pathname.endsWith('/endgame-mastery');

  // Progressive gating state
  const [progress, setProgress] = useState(getStoredProgress);

  // Active stage (1: Understand, 2: Practice, 3: Guided Review)
  const [lessonStep, setLessonStep] = useState(1);

  // Stage 1 State
  const [stage1SelectedOption, setStage1SelectedOption] = useState(null);
  const [stage1Feedback, setStage1Feedback] = useState(null);

  // Stage 2 (5 Practice Exercises) State
  const [currentExIndex, setCurrentExIndex] = useState(() => {
    const saved = getStoredProgress();
    return Math.min(4, saved.practiceSolvedCount);
  });
  const currentExercise = PRACTICE_EXERCISES[currentExIndex];
  const chessRef = useRef(new Chess(currentExercise.fen));
  const [chessFen, setChessFen] = useState(currentExercise.fen);
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [legalSquares, setLegalSquares] = useState([]);
  const [lastMoveSquares, setLastMoveSquares] = useState([]);
  const [practiceStatus, setPracticeStatus] = useState('ready'); // 'ready' | 'correct' | 'incorrect'
  const [practiceFeedback, setPracticeFeedback] = useState(null);
  const [practiceHintLevel, setPracticeHintLevel] = useState(0);

  // Stage 3 (Guided Review) State
  const [currentPlyIndex, setCurrentPlyIndex] = useState(0);
  const [plyPredicted, setPlyPredicted] = useState(false);
  const [plyPredictionFeedback, setPlyPredictionFeedback] = useState(null);
  const [selectedPlyOptionId, setSelectedPlyOptionId] = useState(null);
  const [maxPlyReached, setMaxPlyReached] = useState(0);

  // Square visualizer toggle
  const [showSquareVisualizer, setShowSquareVisualizer] = useState(true);

  // Lock notification toast
  const [lockNotice, setLockNotice] = useState(null);

  // Reset current practice exercise
  const resetPracticeExercise = useCallback((exIdx = currentExIndex) => {
    const ex = PRACTICE_EXERCISES[exIdx];
    chessRef.current = new Chess(ex.fen);
    setChessFen(ex.fen);
    setSelectedSquare(null);
    setLegalSquares([]);
    setLastMoveSquares([]);
    setPracticeStatus('ready');
    setPracticeFeedback(null);
  }, [currentExIndex]);

  // Load a practice exercise by index
  const loadPracticeExercise = useCallback((idx) => {
    if (idx < 0 || idx >= PRACTICE_EXERCISES.length) return;
    setCurrentExIndex(idx);
    resetPracticeExercise(idx);
    setPracticeHintLevel(0);
  }, [resetPracticeExercise]);

  // Sync board when changing steps or exercise
  useEffect(() => {
    if (lessonStep === 1) {
      chessRef.current = new Chess(PRACTICE_EXERCISES[0].fen);
      setChessFen(PRACTICE_EXERCISES[0].fen);
      setLastMoveSquares([]);
    } else if (lessonStep === 2) {
      resetPracticeExercise(currentExIndex);
    } else if (lessonStep === 3) {
      const plyObj = GUIDED_PLIES[currentPlyIndex];
      if (plyObj) {
        const fenToShow = plyPredicted ? plyObj.resultingFen : plyObj.boardFen;
        chessRef.current = new Chess(fenToShow);
        setChessFen(fenToShow);
        if (plyPredicted && plyObj.resultingMove) {
          setLastMoveSquares(plyObj.resultingMove);
        } else {
          setLastMoveSquares([]);
        }
      }
    }
  }, [lessonStep, currentExIndex, currentPlyIndex, plyPredicted, resetPracticeExercise]);

  // Enforce progression rule: Clamp lessonStep if prerequisites not met
  useEffect(() => {
    if (lessonStep === 2 && !progress.stage1Answered) {
      setLessonStep(1);
    } else if (lessonStep === 3 && progress.practiceSolvedCount < 5) {
      setLessonStep(progress.stage1Answered ? 2 : 1);
    }
  }, [lessonStep, progress]);

  // Stage Tab Navigation with strict Lock Enforcement
  const handleTabClick = (targetStage) => {
    if (targetStage === 2 && !progress.stage1Answered) {
      setLockNotice("🔒 Stage 2 Locked: Answer the understanding question in Stage 1 to unlock.");
      setTimeout(() => setLockNotice(null), 3500);
      return;
    }
    if (targetStage === 3 && progress.practiceSolvedCount < 5) {
      setLockNotice(`🔒 Stage 3 Locked: Complete all 5 Practice exercises to unlock (${progress.practiceSolvedCount}/5 completed).`);
      setTimeout(() => setLockNotice(null), 3500);
      return;
    }
    setLessonStep(targetStage);
  };

  // Stage 1 Question Answer Handler
  const handleStage1Answer = (optionId, isCorrect, feedbackText) => {
    setStage1SelectedOption(optionId);
    setStage1Feedback({
      correct: isCorrect,
      text: feedbackText
    });

    if (isCorrect) {
      setProgress(prev => {
        const updated = {
          ...prev,
          stage1Answered: true
        };
        saveStoredProgress({ stage1Answered: true });
        return updated;
      });
    }
  };

  // Stage 2 Interactive Board Click Handler
  const handleSquareClick = (square) => {
    if (lessonStep !== 2 || practiceStatus === 'correct') return;
    const chess = chessRef.current;

    // Deselect if clicking same square
    if (selectedSquare === square) {
      setSelectedSquare(null);
      setLegalSquares([]);
      return;
    }

    const clickedPiece = chess.get(square);

    // Initial piece selection
    if (!selectedSquare) {
      if (clickedPiece && clickedPiece.color === 'w') {
        setSelectedSquare(square);
        const moves = chess.moves({ square, verbose: true });
        setLegalSquares(moves.map(m => m.to));
      }
      return;
    }

    // Switch selection to another White piece
    if (clickedPiece && clickedPiece.color === 'w') {
      setSelectedSquare(square);
      const moves = chess.moves({ square, verbose: true });
      setLegalSquares(moves.map(m => m.to));
      return;
    }

    // Attempting a move
    const from = selectedSquare;
    const to = square;

    const movesFromSelected = chess.moves({ square: from, verbose: true });
    const matchingLegalMove = movesFromSelected.find(m => m.to === to);

    // Reject illegal move
    if (!matchingLegalMove) {
      setSelectedSquare(null);
      setLegalSquares([]);
      return;
    }

    // Play move on chess.js
    const executedMove = chess.move({ from, to });
    if (!executedMove) return;

    setChessFen(chess.fen());
    setLastMoveSquares([from, to]);
    setSelectedSquare(null);
    setLegalSquares([]);

    // Check if move matches expected winning move
    if (from === currentExercise.from && to === currentExercise.to) {
      setPracticeStatus('correct');
      setPracticeFeedback({
        type: 'success',
        title: `Correct Move: 1. ${currentExercise.san}!`,
        text: currentExercise.successExplanation
      });

      const newSolvedCount = Math.max(progress.practiceSolvedCount, currentExIndex + 1);
      setProgress(prev => {
        const updated = {
          ...prev,
          practiceSolvedCount: newSolvedCount,
          stage2Solved: newSolvedCount >= 5
        };
        saveStoredProgress({
          practiceSolvedCount: newSolvedCount,
          stage2Solved: newSolvedCount >= 5
        });
        return updated;
      });
    } else {
      setPracticeStatus('incorrect');
      setPracticeHintLevel(prev => prev + 1);
      setPracticeFeedback({
        type: 'error',
        title: 'Incorrect Move',
        text: 'That move allows Black to enter the square or fails to secure the win. Review the boundary and try again!'
      });
    }
  };

  // Stage 3 Prediction Option Handler with decoupled answer positions
  const handlePlyOptionSelect = (option) => {
    setSelectedPlyOptionId(option.id);
    const plyObj = GUIDED_PLIES[currentPlyIndex];
    const isCorrect = option.id === plyObj.correctId;

    if (isCorrect) {
      setPlyPredicted(true);
      setPlyPredictionFeedback({
        correct: true,
        text: option.explanation
      });

      // Update board to resulting position
      chessRef.current = new Chess(plyObj.resultingFen);
      setChessFen(plyObj.resultingFen);
      if (plyObj.resultingMove) {
        setLastMoveSquares(plyObj.resultingMove);
      }

      setMaxPlyReached(prev => Math.max(prev, currentPlyIndex + 1));

      // If finished final ply (Move 4 a8=Q)
      if (currentPlyIndex === GUIDED_PLIES.length - 1) {
        setProgress(prev => {
          const updated = { ...prev, completed: true };
          saveStoredProgress({ completed: true });
          return updated;
        });
      }
    } else {
      setPlyPredictionFeedback({
        correct: false,
        text: option.explanation
      });
    }
  };

  // Stage 3 Advance to Next Ply
  const handleNextPly = () => {
    if (currentPlyIndex < GUIDED_PLIES.length - 1) {
      const nextIdx = currentPlyIndex + 1;
      setCurrentPlyIndex(nextIdx);
      setPlyPredicted(nextIdx < maxPlyReached);
      setPlyPredictionFeedback(null);
      setSelectedPlyOptionId(null);
    }
  };

  // Stage 3 Go Back to Previous Ply
  const handlePrevPly = () => {
    if (currentPlyIndex > 0) {
      const prevIdx = currentPlyIndex - 1;
      setCurrentPlyIndex(prevIdx);
      setPlyPredicted(true);
      setPlyPredictionFeedback(null);
      setSelectedPlyOptionId(null);
    }
  };

  // Dynamic Rule of the Square visualizer highlight
  const isRuleOfSquareHighlight = (file, rank) => {
    if (!showSquareVisualizer) return false;
    const fIdx = file.charCodeAt(0) - 97;

    // Parse current pawn and king position dynamically from active FEN
    const fenRanks = chessFen.split(' ')[0].split('/');
    let pawnFile = -1, pawnRank = -1;
    let kingFile = -1;

    for (let r = 0; r < 8; r++) {
      let f = 0;
      for (const ch of fenRanks[r]) {
        if (ch === 'P') { pawnFile = f; pawnRank = 8 - r; f++; }
        else if (ch === 'k') { kingFile = f; f++; }
        else if (Number.isInteger(parseInt(ch))) { f += parseInt(ch); }
        else { f++; }
      }
    }

    if (pawnFile === -1 || pawnRank >= 8) return false;

    // Effective rank for Rule of the Square calculation (2nd rank pawns jump to rank 4)
    const effectiveRank = pawnRank === 2 ? 4 : pawnRank;
    const side = 8 - effectiveRank;

    let minFile, maxFile;
    if (kingFile >= pawnFile) {
      minFile = pawnFile;
      maxFile = Math.min(7, pawnFile + side);
    } else {
      minFile = Math.max(0, pawnFile - side);
      maxFile = pawnFile;
    }

    return rank >= effectiveRank && fIdx >= minFile && fIdx <= maxFile;
  };

  // ==========================================
  // VIEW 1: ACTIVE INTERACTIVE LESSON
  // ==========================================
  if (isLessonActive) {
    const ranks = [8, 7, 6, 5, 4, 3, 2, 1];
    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

    const currentPlyObj = GUIDED_PLIES[currentPlyIndex];
    const isFinalPlyCompleted = currentPlyIndex === GUIDED_PLIES.length - 1 && plyPredicted;

    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.65rem',
        maxWidth: '1080px',
        width: '100%',
        margin: '0 auto',
        boxSizing: 'border-box'
      }}>
        {/* RESPONSIVE LAYOUT & SCROLLBAR STYLING */}
        <style>{`
          .learn-desktop-grid {
            display: grid;
            grid-template-columns: minmax(320px, 440px) 1fr;
            gap: 1.25rem;
            align-items: start;
            width: 100%;
          }
          .learn-board-box {
            width: 100%;
            max-width: min(440px, calc(100vh - 185px));
            aspect-ratio: 1;
          }
          .learn-controls-box {
            width: 100%;
            max-width: min(440px, calc(100vh - 185px));
          }
          .learn-instruction-container {
            height: calc(100vh - 145px);
            max-height: calc(100vh - 145px);
            display: flex;
            flex-direction: column;
            justifyContent: space-between;
            background-color: #080808;
            border: 1px solid #171717;
            border-radius: 16px;
            padding: 1.25rem 1.4rem;
            box-shadow: 0 8px 30px rgba(0,0,0,0.5);
            box-sizing: border-box;
          }
          .learn-instruction-scroll {
            overflow-y: auto;
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 0.85rem;
            padding-right: 4px;
            scrollbar-width: thin;
            scrollbar-color: #27272A #080808;
          }
          .learn-instruction-scroll::-webkit-scrollbar {
            width: 6px;
          }
          .learn-instruction-scroll::-webkit-scrollbar-track {
            background: #080808;
            border-radius: 4px;
          }
          .learn-instruction-scroll::-webkit-scrollbar-thumb {
            background: #27272A;
            border-radius: 4px;
          }
          .learn-instruction-scroll::-webkit-scrollbar-thumb:hover {
            background: #3F3F46;
          }
          @media (max-width: 860px) {
            .learn-desktop-grid {
              grid-template-columns: 1fr;
              gap: 1rem;
            }
            .learn-board-box {
              max-width: min(100%, 420px);
            }
            .learn-controls-box {
              max-width: min(100%, 420px);
            }
            .learn-instruction-container {
              height: auto;
              max-height: none;
              overflow-y: visible;
            }
          }
        `}</style>

        {/* TOP BAR: BACK NAVIGATION & PROGRESSIVE STAGE TABS */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          flexWrap: 'wrap',
          gap: '0.5rem'
        }}>
          <button
            onClick={() => navigate('/learn')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              backgroundColor: '#0E0E12',
              color: '#FFFFFF',
              border: '1px solid #1A1A1D',
              borderRadius: '8px',
              padding: '0.45rem 0.85rem',
              fontWeight: 700,
              fontSize: '0.85rem',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            <ArrowLeft size={16} />
            <span>Back to Courses</span>
          </button>

          {/* PROGRESSION STAGE TABS */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
            {[
              { num: 1, label: '1. Understand', unlocked: true },
              { num: 2, label: `2. Practice (${progress.practiceSolvedCount}/5)`, unlocked: progress.stage1Answered },
              { num: 3, label: '3. Guided Review', unlocked: progress.practiceSolvedCount >= 5 }
            ].map(s => {
              const isActive = lessonStep === s.num;
              return (
                <button
                  key={s.num}
                  onClick={() => handleTabClick(s.num)}
                  style={{
                    padding: '0.42rem 0.85rem',
                    borderRadius: '8px',
                    backgroundColor: isActive ? '#FFFFFF' : '#080808',
                    color: isActive ? '#000000' : (s.unlocked ? '#D1D5DB' : '#52525B'),
                    border: isActive ? 'none' : '1px solid #171717',
                    fontWeight: 800,
                    fontSize: '0.82rem',
                    cursor: s.unlocked ? 'pointer' : 'not-allowed',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    transition: 'all 0.15s ease',
                    opacity: s.unlocked ? 1 : 0.6
                  }}
                >
                  {!s.unlocked && <Lock size={12} color="#71717A" />}
                  <span>{s.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* LOCK NOTICE TOAST */}
        {lockNotice && (
          <div style={{
            backgroundColor: '#1C150A',
            border: '1px solid #78350F',
            color: '#FBBF24',
            padding: '0.5rem 0.85rem',
            borderRadius: '8px',
            fontSize: '0.85rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '0.45rem'
          }}>
            <AlertCircle size={16} />
            <span>{lockNotice}</span>
          </div>
        )}

        {/* MAIN LESSON CONTAINER (BOARD ON LEFT, INSTRUCTION ON RIGHT) */}
        <div className="learn-desktop-grid">
          {/* LEFT: 8x8 CHESSBOARD (REUSING PRESERVED COLORS #F0D9B5 / #B58863) */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', width: '100%' }}>
            <div className="learn-board-box" style={{
              backgroundColor: '#B58863',
              border: '2px solid #1A1A1D',
              borderRadius: '12px',
              boxShadow: '0 16px 45px rgba(0,0,0,0.85)',
              overflow: 'hidden',
              display: 'grid',
              gridTemplateColumns: 'repeat(8, 1fr)',
              gridTemplateRows: 'repeat(8, 1fr)',
              position: 'relative',
              userSelect: 'none'
            }}>
              {ranks.map((rank, rIdx) =>
                files.map((file, fIdx) => {
                  const squareName = `${file}${rank}`;
                  const isLightSquare = (rIdx + fIdx) % 2 === 0;
                  const bgSquareColor = isLightSquare ? '#F0D9B5' : '#B58863';

                  const isSelected = selectedSquare === squareName;
                  const isLegalTarget = legalSquares.includes(squareName);
                  const isLastMove = lastMoveSquares.includes(squareName);
                  const isHighlightedInSquare = isRuleOfSquareHighlight(file, rank);

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
                        cursor: (lessonStep === 2 && piece && piece.color === 'w') || isLegalTarget ? 'pointer' : 'default',
                        transition: 'background-color 0.15s ease'
                      }}
                    >
                      {/* Rule of Square visualizer dashed boundary */}
                      {isHighlightedInSquare && (
                        <div style={{
                          position: 'absolute',
                          inset: 0,
                          backgroundColor: 'rgba(59, 130, 246, 0.12)',
                          border: '1px dashed rgba(59, 130, 246, 0.35)',
                          pointerEvents: 'none',
                          zIndex: 1
                        }} />
                      )}

                      {/* Rank label */}
                      {fIdx === 0 && (
                        <span style={{
                          position: 'absolute',
                          top: '2px',
                          left: '3px',
                          fontSize: '0.62rem',
                          fontWeight: 900,
                          color: isLightSquare ? '#B58863' : '#F0D9B5',
                          pointerEvents: 'none',
                          zIndex: 2
                        }}>
                          {rank}
                        </span>
                      )}

                      {/* File label */}
                      {rIdx === 7 && (
                        <span style={{
                          position: 'absolute',
                          bottom: '2px',
                          right: '3px',
                          fontSize: '0.62rem',
                          fontWeight: 900,
                          color: isLightSquare ? '#B58863' : '#F0D9B5',
                          pointerEvents: 'none',
                          zIndex: 2
                        }}>
                          {file.toUpperCase()}
                        </span>
                      )}

                      {/* Authentic Piece image */}
                      {pieceSvgKey && (
                        <img
                          src={`/images/${pieceSvgKey}.png`}
                          alt={pieceSvgKey}
                          style={{
                            width: '85%',
                            height: '85%',
                            objectFit: 'contain',
                            zIndex: 3,
                            pointerEvents: 'none',
                            filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.35))'
                          }}
                        />
                      )}

                      {/* Legal Move indicator */}
                      {isLegalTarget && (
                        <div style={{
                          position: 'absolute',
                          inset: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          zIndex: 4,
                          pointerEvents: 'none'
                        }}>
                          {piece ? (
                            <div style={{
                              width: '85%',
                              height: '85%',
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
              )}
            </div>

            {/* Board Controls Bar */}
            <div className="learn-controls-box" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <button
                onClick={() => setShowSquareVisualizer(!showSquareVisualizer)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  backgroundColor: showSquareVisualizer ? '#18181D' : '#080808',
                  color: showSquareVisualizer ? '#60A5FA' : '#8E8E93',
                  border: '1px solid #1A1A1D',
                  borderRadius: '6px',
                  padding: '0.3rem 0.65rem',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                <span>{showSquareVisualizer ? 'Hide Square Boundary' : 'Show Square Boundary'}</span>
              </button>

              {lessonStep === 2 && (
                <button
                  onClick={() => resetPracticeExercise(currentExIndex)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    backgroundColor: '#0E0E12',
                    color: '#FFFFFF',
                    border: '1px solid #1A1A1D',
                    borderRadius: '6px',
                    padding: '0.3rem 0.65rem',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  <RotateCcw size={13} />
                  <span>Reset Board</span>
                </button>
              )}
            </div>
          </div>

          {/* RIGHT: INSTRUCTION & INTERACTION PANEL */}
          <div className="learn-instruction-container">

            {/* ========================================= */}
            {/* STAGE 1: UNDERSTAND (MANDATORY GATEWAY)   */}
            {/* ========================================= */}
            {lessonStep === 1 && (
              <>
                <div className="learn-instruction-scroll">
                  <div>
                    <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#3B82F6', letterSpacing: '1.2px', textTransform: 'uppercase' }}>
                      STAGE 1 — CONCEPT
                    </span>
                    <h2 style={{ fontFamily: "'Anton', sans-serif", fontSize: 'clamp(1.6rem, 2.2vw, 1.95rem)', margin: '0.2rem 0 0.15rem 0', color: '#FFFFFF' }}>
                      The Rule of the Square
                    </h2>
                    <p style={{ fontSize: 'clamp(1.05rem, 1.15vw, 1.18rem)', color: '#D4D4D8', lineHeight: 1.6, margin: '0.35rem 0 0 0' }}>
                      Can a passed pawn promote without the help of its King? You can tell instantly using a simple mental square.
                    </p>
                  </div>

                  {/* THE CONCEPT BREAKDOWN */}
                  <div style={{
                    backgroundColor: '#0A121E',
                    border: '1px solid #1E3A5F',
                    borderRadius: '12px',
                    padding: '1rem 1.1rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem' }}>
                      <span style={{
                        backgroundColor: '#1E3A5F',
                        color: '#60A5FA',
                        borderRadius: '50%',
                        width: '24px',
                        height: '24px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.85rem',
                        fontWeight: 800,
                        flexShrink: 0,
                        marginTop: '2px'
                      }}>1</span>
                      <div style={{ fontSize: 'clamp(1.02rem, 1.1vw, 1.15rem)', color: '#F1F5F9', lineHeight: 1.6 }}>
                        <strong>Count to promotion:</strong> Count squares from your pawn down to its promotion square (from <strong>a4</strong> to <strong>a8</strong> is <strong>4 squares</strong>).
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem' }}>
                      <span style={{
                        backgroundColor: '#1E3A5F',
                        color: '#60A5FA',
                        borderRadius: '50%',
                        width: '24px',
                        height: '24px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.85rem',
                        fontWeight: 800,
                        flexShrink: 0,
                        marginTop: '2px'
                      }}>2</span>
                      <div style={{ fontSize: 'clamp(1.02rem, 1.1vw, 1.15rem)', color: '#F1F5F9', lineHeight: 1.6 }}>
                        <strong>Draw the square across:</strong> Measure that same distance sideways toward the enemy King (files <strong>a</strong> across to <strong>e</strong>), creating a square bounded by <strong>a4–e4–e8–a8</strong>.
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem' }}>
                      <span style={{
                        backgroundColor: '#1E3A5F',
                        color: '#60A5FA',
                        borderRadius: '50%',
                        width: '24px',
                        height: '24px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.85rem',
                        fontWeight: 800,
                        flexShrink: 0,
                        marginTop: '2px'
                      }}>3</span>
                      <div style={{ fontSize: 'clamp(1.02rem, 1.1vw, 1.15rem)', color: '#F1F5F9', lineHeight: 1.6 }}>
                        <strong>The Rule:</strong> If the defending King cannot step inside the square on its move, the pawn outruns the King and promotes untouched!
                      </div>
                    </div>
                  </div>

                  {/* UNDERSTANDING QUESTION (PROGRESSION GATE) */}
                  <div style={{
                    backgroundColor: '#0D0D10',
                    border: '1px solid #27272A',
                    borderRadius: '14px',
                    padding: '1.1rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                      <span style={{
                        fontSize: '0.72rem',
                        fontWeight: 800,
                        backgroundColor: '#27272A',
                        color: '#FBBF24',
                        padding: '0.2rem 0.55rem',
                        borderRadius: '6px',
                        letterSpacing: '1px'
                      }}>
                        CHECK YOUR UNDERSTANDING
                      </span>
                    </div>

                    <h3 style={{ fontSize: 'clamp(1.05rem, 1.15vw, 1.18rem)', margin: 0, color: '#FFFFFF', fontWeight: 700, lineHeight: 1.45 }}>
                      What determines whether the defending King can catch an advancing passed pawn without help?
                    </h3>

                    {/* ANSWER OPTIONS (DECOUPLED ORDER) */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {[
                        {
                          id: 'A',
                          text: "The defending King must always start on the same file as the passed pawn.",
                          correct: false,
                          feedback: "Not quite. The defending King can start on any file—what matters is whether it can reach the boundary of the square before or as the pawn advances."
                        },
                        {
                          id: 'B',
                          text: "Whether the defending King can step inside the pawn's square on its move.",
                          correct: true,
                          feedback: "Correct! If the defending King cannot step inside the pawn's square on its turn, it can never catch the pawn. The pawn outruns the King and promotes cleanly."
                        },
                        {
                          id: 'C',
                          text: "The pawn only promotes if its own King controls the promotion square first.",
                          correct: false,
                          feedback: "Incorrect. Passed pawns can frequently promote completely on their own without King assistance when outside the square!"
                        }
                      ].map(opt => {
                        const isSelected = stage1SelectedOption === opt.id;
                        return (
                          <button
                            key={opt.id}
                            onClick={() => handleStage1Answer(opt.id, opt.correct, opt.feedback)}
                            style={{
                              textAlign: 'left',
                              padding: '0.8rem 1rem',
                              borderRadius: '10px',
                              backgroundColor: isSelected
                                ? (opt.correct ? '#0B1E13' : '#1E0E0E')
                                : '#121216',
                              border: isSelected
                                ? (opt.correct ? '1.5px solid #10B981' : '1.5px solid #EF4444')
                                : '1px solid #1E1E24',
                              color: isSelected
                                ? (opt.correct ? '#10B981' : '#EF4444')
                                : '#E4E4E7',
                              fontSize: 'clamp(1rem, 1.1vw, 1.12rem)',
                              lineHeight: 1.5,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: '0.75rem',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            <span>{opt.text}</span>
                            {isSelected && (
                              opt.correct ? <CheckCircle2 size={18} color="#10B981" /> : <AlertCircle size={18} color="#EF4444" />
                            )}
                          </button>
                        );
                      })}
                    </div>

                    {/* FEEDBACK BANNER */}
                    {stage1Feedback && (
                      <div style={{
                        backgroundColor: stage1Feedback.correct ? '#0B1E13' : '#1E0E0E',
                        border: stage1Feedback.correct ? '1px solid #165B32' : '1px solid #3F1D1D',
                        borderRadius: '10px',
                        padding: '0.8rem 1rem',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '0.5rem'
                      }}>
                        {stage1Feedback.correct ? (
                          <CheckCircle2 size={18} color="#10B981" style={{ flexShrink: 0, marginTop: '2px' }} />
                        ) : (
                          <AlertCircle size={18} color="#EF4444" style={{ flexShrink: 0, marginTop: '2px' }} />
                        )}
                        <p style={{ margin: 0, fontSize: '0.92rem', color: '#D1D5DB', lineHeight: 1.5 }}>
                          {stage1Feedback.text}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* BOTTOM PINNED ACTION BAR */}
                <div style={{ paddingTop: '0.75rem', borderTop: '1px solid #1A1A1D', marginTop: '0.5rem' }}>
                  {progress.stage1Answered ? (
                    <button
                      onClick={() => setLessonStep(2)}
                      style={{
                        width: '100%',
                        backgroundColor: '#FFFFFF',
                        color: '#000000',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '0.8rem',
                        fontWeight: 800,
                        fontSize: '0.92rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.45rem'
                      }}
                    >
                      <span>Advance to Practice (Stage 2)</span>
                      <ChevronRight size={16} />
                    </button>
                  ) : (
                    <div style={{ fontSize: '0.88rem', color: '#8E8E93', textAlign: 'center' }}>
                      Select the correct answer above to unlock Stage 2 Practice.
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ========================================= */}
            {/* STAGE 2: 5 PROGRESSIVE PRACTICE EXERCISES */}
            {/* ========================================= */}
            {lessonStep === 2 && (
              <>
                <div className="learn-instruction-scroll">
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#10B981', letterSpacing: '1.2px', textTransform: 'uppercase' }}>
                        STAGE 2 — PRACTICE
                      </span>
                      <span style={{
                        fontSize: '0.78rem',
                        fontWeight: 800,
                        backgroundColor: '#121215',
                        border: '1px solid #27272A',
                        padding: '0.2rem 0.6rem',
                        borderRadius: '8px',
                        color: '#10B981'
                      }}>
                        Exercise {currentExIndex + 1} of 5
                      </span>
                    </div>

                    <h2 style={{ fontFamily: "'Anton', sans-serif", fontSize: 'clamp(1.5rem, 2vw, 1.85rem)', margin: '0.2rem 0 0.15rem 0', color: '#FFFFFF' }}>
                      {currentExercise.title}
                    </h2>
                    <p style={{ fontSize: 'clamp(1.02rem, 1.1vw, 1.15rem)', color: '#D4D4D8', lineHeight: 1.55, margin: '0.25rem 0 0 0' }}>
                      {currentExercise.subtitle}. White to move: Find the single winning move to keep Black's King outside the square!
                    </p>
                  </div>

                  {/* EXERCISE NAVIGATOR PILLS (Allows reviewing previously completed exercises) */}
                  <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                    {PRACTICE_EXERCISES.map((ex, idx) => {
                      const isCompleted = idx < progress.practiceSolvedCount;
                      const isCurrent = idx === currentExIndex;
                      const isUnlocked = idx <= progress.practiceSolvedCount;
                      return (
                        <button
                          key={ex.id}
                          onClick={() => isUnlocked && loadPracticeExercise(idx)}
                          disabled={!isUnlocked}
                          style={{
                            padding: '0.35rem 0.7rem',
                            borderRadius: '6px',
                            backgroundColor: isCurrent ? '#FFFFFF' : (isCompleted ? '#0B1E13' : '#121216'),
                            color: isCurrent ? '#000000' : (isCompleted ? '#10B981' : (isUnlocked ? '#D1D5DB' : '#52525B')),
                            border: isCurrent ? 'none' : (isCompleted ? '1px solid #165B32' : '1px solid #27272A'),
                            fontSize: '0.78rem',
                            fontWeight: 800,
                            cursor: isUnlocked ? 'pointer' : 'not-allowed',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.3rem'
                          }}
                        >
                          {isCompleted && <Check size={11} />}
                          <span>Ex {idx + 1}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* PROGRESSIVE HINTS (SHOWN ONLY AFTER ATTEMPTS) */}
                  {practiceHintLevel > 0 && practiceStatus !== 'correct' && (
                    <div style={{
                      backgroundColor: '#1C150A',
                      border: '1px solid #78350F',
                      borderRadius: '10px',
                      padding: '0.85rem 1rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.35rem'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <HelpCircle size={16} color="#FBBF24" />
                        <span style={{ fontWeight: 800, fontSize: '0.85rem', color: '#FBBF24' }}>
                          HINT {practiceHintLevel >= 2 ? '(Specific Move)' : '(General Direction)'}
                        </span>
                      </div>
                      <p style={{ margin: 0, fontSize: '0.92rem', color: '#FEF3C7', lineHeight: 1.5 }}>
                        {practiceHintLevel === 1 ? currentExercise.hint1 : currentExercise.hint2}
                      </p>
                    </div>
                  )}

                  {/* FEEDBACK BANNER */}
                  {practiceFeedback && (
                    <div style={{
                      backgroundColor: practiceFeedback.type === 'success' ? '#0B1E13' : '#1E0E0E',
                      border: practiceFeedback.type === 'success' ? '1px solid #165B32' : '1px solid #3F1D1D',
                      borderRadius: '12px',
                      padding: '0.85rem 1rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.4rem'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                        {practiceFeedback.type === 'success' ? (
                          <CheckCircle2 size={18} color="#10B981" />
                        ) : (
                          <AlertCircle size={18} color="#EF4444" />
                        )}
                        <span style={{
                          fontWeight: 800,
                          fontSize: '0.95rem',
                          color: practiceFeedback.type === 'success' ? '#10B981' : '#EF4444'
                        }}>
                          {practiceFeedback.title}
                        </span>
                      </div>
                      <p style={{ margin: 0, fontSize: '0.92rem', color: '#D1D5DB', lineHeight: 1.55 }}>
                        {practiceFeedback.text}
                      </p>
                    </div>
                  )}
                </div>

                {/* BOTTOM PINNED ACTION BAR */}
                <div style={{ paddingTop: '0.75rem', borderTop: '1px solid #1A1A1D', marginTop: '0.5rem', display: 'flex', gap: '0.5rem' }}>
                  {practiceStatus === 'correct' ? (
                    currentExIndex < 4 ? (
                      <button
                        onClick={() => loadPracticeExercise(currentExIndex + 1)}
                        style={{
                          flex: 1,
                          backgroundColor: '#FFFFFF',
                          color: '#000000',
                          border: 'none',
                          borderRadius: '8px',
                          padding: '0.8rem',
                          fontWeight: 800,
                          fontSize: '0.92rem',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.45rem'
                        }}
                      >
                        <span>Next Exercise ({currentExIndex + 2} of 5)</span>
                        <ChevronRight size={16} />
                      </button>
                    ) : (
                      <button
                        onClick={() => setLessonStep(3)}
                        style={{
                          flex: 1,
                          backgroundColor: '#10B981',
                          color: '#000000',
                          border: 'none',
                          borderRadius: '8px',
                          padding: '0.8rem',
                          fontWeight: 900,
                          fontSize: '0.92rem',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.45rem'
                        }}
                      >
                        <span>Continue to Guided Review (Stage 3)</span>
                        <ChevronRight size={16} />
                      </button>
                    )
                  ) : practiceStatus === 'incorrect' ? (
                    <button
                      onClick={() => resetPracticeExercise(currentExIndex)}
                      style={{
                        flex: 1,
                        backgroundColor: '#FFFFFF',
                        color: '#000000',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '0.8rem',
                        fontWeight: 800,
                        fontSize: '0.9rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.45rem'
                      }}
                    >
                      <RotateCcw size={16} />
                      <span>Reset Board & Try Again</span>
                    </button>
                  ) : (
                    <div style={{ fontSize: '0.88rem', color: '#8E8E93', textAlign: 'center', width: '100%' }}>
                      💡 <em>Click your pawn on the board and make your move.</em>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ========================================= */}
            {/* STAGE 3: GUIDED REVIEW (MOVE BY MOVE)     */}
            {/* ========================================= */}
            {lessonStep === 3 && (
              <>
                <div className="learn-instruction-scroll">
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#F59E0B', letterSpacing: '1.2px', textTransform: 'uppercase' }}>
                        STAGE 3 — GUIDED REVIEW
                      </span>
                      <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#8E8E93' }}>
                        Step {currentPlyIndex + 1} of {GUIDED_PLIES.length}
                      </span>
                    </div>

                    <h2 style={{ fontFamily: "'Anton', sans-serif", fontSize: 'clamp(1.5rem, 2vw, 1.85rem)', margin: '0.2rem 0 0.15rem 0', color: '#FFFFFF' }}>
                      {currentPlyObj.title}
                    </h2>
                    <p style={{ fontSize: 'clamp(1.02rem, 1.1vw, 1.15rem)', color: '#D4D4D8', lineHeight: 1.55, margin: '0.25rem 0 0 0' }}>
                      {currentPlyObj.prompt}
                    </p>
                  </div>

                  {/* PREDICTION OPTIONS (EXPLICIT ID AND DECOUPLED POSITION) */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {currentPlyObj.options.map(opt => {
                      const isSelected = selectedPlyOptionId === opt.id;
                      const isCorrect = opt.id === currentPlyObj.correctId;
                      return (
                        <button
                          key={opt.id}
                          onClick={() => handlePlyOptionSelect(opt)}
                          style={{
                            textAlign: 'left',
                            padding: '0.85rem 1rem',
                            borderRadius: '10px',
                            backgroundColor: isSelected
                              ? (isCorrect ? '#0B1E13' : '#1E0E0E')
                              : '#121216',
                            border: isSelected
                              ? (isCorrect ? '1.5px solid #10B981' : '1.5px solid #EF4444')
                              : '1px solid #1E1E24',
                            color: isSelected
                              ? (isCorrect ? '#10B981' : '#EF4444')
                              : '#E4E4E7',
                            fontSize: 'clamp(1rem, 1.1vw, 1.12rem)',
                            lineHeight: 1.5,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '0.75rem',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <span style={{ fontWeight: 700 }}>{opt.text}</span>
                          {isSelected && (
                            isCorrect ? <CheckCircle2 size={18} color="#10B981" /> : <AlertCircle size={18} color="#EF4444" />
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* EXPLANATORY FEEDBACK */}
                  {plyPredictionFeedback && (
                    <div style={{
                      backgroundColor: plyPredictionFeedback.correct ? '#0B1E13' : '#1E0E0E',
                      border: plyPredictionFeedback.correct ? '1px solid #165B32' : '1px solid #3F1D1D',
                      borderRadius: '10px',
                      padding: '0.85rem 1rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.4rem'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                        {plyPredictionFeedback.correct ? (
                          <CheckCircle2 size={18} color="#10B981" />
                        ) : (
                          <AlertCircle size={18} color="#EF4444" />
                        )}
                        <span style={{
                          fontWeight: 800,
                          fontSize: '0.92rem',
                          color: plyPredictionFeedback.correct ? '#10B981' : '#EF4444'
                        }}>
                          {plyPredictionFeedback.correct ? 'Correct Prediction!' : 'Not Quite'}
                        </span>
                      </div>
                      <p style={{ margin: 0, fontSize: '0.92rem', color: '#D1D5DB', lineHeight: 1.55 }}>
                        {plyPredictionFeedback.text}
                      </p>
                    </div>
                  )}

                  {/* FINAL COMPLETION CEREMONY BANNER */}
                  {isFinalPlyCompleted && (
                    <div style={{
                      backgroundColor: '#0A1E13',
                      border: '1.5px solid #10B981',
                      borderRadius: '12px',
                      padding: '1rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.5rem',
                      marginTop: '0.25rem'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                        <Trophy size={20} color="#10B981" />
                        <span style={{ fontWeight: 900, fontSize: '1.05rem', color: '#10B981' }}>
                          Lesson Complete — Mastery Achieved!
                        </span>
                      </div>
                      <p style={{ margin: 0, fontSize: '0.92rem', color: '#D1D5DB', lineHeight: 1.55 }}>
                        You have solved all 5 practice exercises and verified the principal line: <strong>1. a5 Ke6 2. a6 Kd7 3. a7 Kc7 4. a8=Q</strong>. You now possess master-level command of the Rule of the Square!
                      </p>
                    </div>
                  )}
                </div>

                {/* BOTTOM PINNED ACTION BAR (IMMEDIATELY ACCESSIBLE) */}
                <div style={{ paddingTop: '0.75rem', borderTop: '1px solid #1A1A1D', marginTop: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
                  <button
                    onClick={handlePrevPly}
                    disabled={currentPlyIndex === 0}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      backgroundColor: currentPlyIndex === 0 ? '#121215' : '#1E1E24',
                      color: currentPlyIndex === 0 ? '#52525B' : '#FFFFFF',
                      border: '1px solid #27272A',
                      borderRadius: '8px',
                      padding: '0.65rem 0.9rem',
                      fontWeight: 700,
                      fontSize: '0.85rem',
                      cursor: currentPlyIndex === 0 ? 'not-allowed' : 'pointer'
                    }}
                  >
                    <ChevronLeft size={16} />
                    <span>Previous Move</span>
                  </button>

                  {isFinalPlyCompleted ? (
                    <button
                      onClick={() => navigate('/learn')}
                      style={{
                        backgroundColor: '#10B981',
                        color: '#000000',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '0.75rem 1.25rem',
                        fontWeight: 900,
                        fontSize: '0.92rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.45rem'
                      }}
                    >
                      <Check size={18} />
                      <span>Finish Lesson & Return to Courses</span>
                    </button>
                  ) : (
                    <button
                      onClick={handleNextPly}
                      disabled={!plyPredicted}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        backgroundColor: plyPredicted ? '#FFFFFF' : '#121215',
                        color: plyPredicted ? '#000000' : '#52525B',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '0.65rem 1rem',
                        fontWeight: 800,
                        fontSize: '0.85rem',
                        cursor: plyPredicted ? 'pointer' : 'not-allowed'
                      }}
                    >
                      <span>Next Move</span>
                      <ChevronRight size={16} />
                    </button>
                  )}
                </div>
              </>
            )}

          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // VIEW 2: COURSE CATALOG (/learn)
  // ==========================================
  const isEndgameCompleted = progress.completed;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '960px', width: '100%' }}>
      <div>
        <h1 style={{ fontFamily: "'Anton', 'Bebas Neue', sans-serif", fontSize: '2.4rem', margin: 0, color: '#FFFFFF' }}>
          LEARN CHESS
        </h1>
        <p style={{ color: '#8E8E93', fontSize: '0.95rem', margin: '0.2rem 0 0 0' }}>
          Interactive Masterclasses, Tactical Patterns & Opening Theory
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
        {/* 1. ENDGAME MASTERY (ACTIVE LESSON) */}
        <div style={{
          backgroundColor: '#080808',
          border: isEndgameCompleted ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid #171717',
          borderRadius: '16px',
          padding: '1.4rem',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          gap: '1.25rem',
          boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
          position: 'relative',
          overflow: 'hidden'
        }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#8E8E93', letterSpacing: '1px' }}>
                ALL LEVELS • 20 MINS
              </span>
              {isEndgameCompleted ? (
                <span style={{
                  fontSize: '0.65rem',
                  fontWeight: 800,
                  backgroundColor: 'rgba(16, 185, 129, 0.15)',
                  color: '#10B981',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  padding: '0.15rem 0.5rem',
                  borderRadius: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem'
                }}>
                  <Check size={11} />
                  <span>COMPLETED</span>
                </span>
              ) : (
                <span style={{
                  fontSize: '0.65rem',
                  fontWeight: 800,
                  backgroundColor: 'rgba(59, 130, 246, 0.15)',
                  color: '#60A5FA',
                  border: '1px solid rgba(59, 130, 246, 0.3)',
                  padding: '0.15rem 0.5rem',
                  borderRadius: '12px'
                }}>
                  AVAILABLE NOW
                </span>
              )}
            </div>

            <h3 style={{ fontFamily: "'Anton', sans-serif", fontSize: '1.6rem', margin: '0.5rem 0 0.3rem 0', color: '#FFFFFF' }}>
              Endgame Mastery
            </h3>
            <p style={{ fontSize: '0.88rem', color: '#8E8E93', margin: 0, lineHeight: 1.45 }}>
              King & Pawn fundamentals — learn and practice the Rule of the Square across 5 progressive board exercises with move validation.
            </p>
          </div>

          <button
            onClick={() => navigate('/learn/endgame-mastery')}
            style={{
              backgroundColor: '#FFFFFF',
              color: '#000000',
              border: 'none',
              borderRadius: '8px',
              padding: '0.75rem',
              fontWeight: 800,
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.4rem',
              transition: 'all 0.15s ease'
            }}
          >
            <span>{isEndgameCompleted ? 'REPLAY LESSON →' : 'START LESSON →'}</span>
          </button>
        </div>

        {/* 2. SICILIAN DEFENSE SECRETS (COMING SOON) */}
        <div style={{
          backgroundColor: '#080808',
          border: '1px solid #141416',
          borderRadius: '16px',
          padding: '1.4rem',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          gap: '1.25rem',
          boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
          opacity: 0.65
        }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#52525B', letterSpacing: '1px' }}>
                INTERMEDIATE • 60 MINS
              </span>
              <span style={{
                fontSize: '0.65rem',
                fontWeight: 800,
                backgroundColor: '#121215',
                color: '#71717A',
                border: '1px solid #1E1E22',
                padding: '0.15rem 0.5rem',
                borderRadius: '12px'
              }}>
                COMING SOON
              </span>
            </div>

            <h3 style={{ fontFamily: "'Anton', sans-serif", fontSize: '1.6rem', margin: '0.5rem 0 0.3rem 0', color: '#D4D4D8' }}>
              Sicilian Defense Secrets
            </h3>
            <p style={{ fontSize: '0.85rem', color: '#71717A', margin: 0, lineHeight: 1.45 }}>
              Sharp counter-attacking lines for Black against 1.e4.
            </p>
          </div>

          <button
            disabled
            style={{
              backgroundColor: '#121215',
              color: '#52525B',
              border: '1px solid #1A1A1D',
              borderRadius: '8px',
              padding: '0.75rem',
              fontWeight: 800,
              fontSize: '0.82rem',
              cursor: 'not-allowed'
            }}
          >
            COMING SOON
          </button>
        </div>

        {/* 3. CALCULATION & TACTICS (COMING SOON) */}
        <div style={{
          backgroundColor: '#080808',
          border: '1px solid #141416',
          borderRadius: '16px',
          padding: '1.4rem',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          gap: '1.25rem',
          boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
          opacity: 0.65
        }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#52525B', letterSpacing: '1px' }}>
                ADVANCED • 50 MINS
              </span>
              <span style={{
                fontSize: '0.65rem',
                fontWeight: 800,
                backgroundColor: '#121215',
                color: '#71717A',
                border: '1px solid #1E1E22',
                padding: '0.15rem 0.5rem',
                borderRadius: '12px'
              }}>
                COMING SOON
              </span>
            </div>

            <h3 style={{ fontFamily: "'Anton', sans-serif", fontSize: '1.6rem', margin: '0.5rem 0 0.3rem 0', color: '#D4D4D8' }}>
              Calculation & Tactics
            </h3>
            <p style={{ fontSize: '0.85rem', color: '#71717A', margin: 0, lineHeight: 1.45 }}>
              Calculate candidate moves ahead with systematic board visualization.
            </p>
          </div>

          <button
            disabled
            style={{
              backgroundColor: '#121215',
              color: '#52525B',
              border: '1px solid #1A1A1D',
              borderRadius: '8px',
              padding: '0.75rem',
              fontWeight: 800,
              fontSize: '0.82rem',
              cursor: 'not-allowed'
            }}
          >
            COMING SOON
          </button>
        </div>
      </div>
    </div>
  );
}
