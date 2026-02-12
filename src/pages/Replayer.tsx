import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import { createStockfishEngine } from "../engine/stockfish";
import { isBookMove, getOpeningName } from "../lib/openings";
import type {
  ArchiveGame,
  MoveInfo,
  AnalyzedMove,
  EvalScore,
  Classification,
} from "../types";
import { ArrowLeft, ArrowRight, FastForward, Rewind } from "lucide-react";

// --- Types (Temporary, should be moved to src/types.ts) ---
// const scoreToCp... etc util functions need to be imported or duplicated.
// For this refactor, I will assumed we moved utils to src/lib/chessUtils.ts or similar.
// But to avoid too many file creations in one go, I'll inline them here or copy them.

const scoreToCp = (score: EvalScore) => {
  if (score.type === "cp") {
    return score.value;
  }
  // Mate: convert to a large but bounded value so it doesn't dominate math.
  // mate +3 → +9700, mate -3 → −9700, clamped at ±10000.
  const mateVal =
    score.value > 0
      ? 10000 - Math.abs(score.value) * 100
      : -10000 + Math.abs(score.value) * 100;
  return Math.max(-10000, Math.min(10000, mateVal));
};

/**
 * Normalize eval to White's absolute perspective.
 * `sideToMove` is whose turn it is in the position that was evaluated.
 * Stockfish always reports from side-to-move's POV.
 */
const evalWhitePov = (score: EvalScore, sideToMove: "w" | "b") => {
  const cp = scoreToCp(score);
  return sideToMove === "w" ? cp : -cp;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const evalToWinProb = (whitePovCp: number) => {
  // Chess.com model: WP = 50 + 50 * (2 / (1 + exp(-0.00368208 * cp)) - 1)
  // Simplified: WP = 1 / (1 + exp(-0.00368208 * cp))
  // Constant 0.00368208 ≈ 1/271.7
  const bounded = clamp(whitePovCp, -1500, 1500);
  return 1 / (1 + Math.exp(-0.00368208 * bounded));
};

// Start of EvalBar component (inline for now)
const EvalBar = ({ currentEval }: { currentEval: number }) => {
  const evalRatio = Math.min(1, Math.max(0, (currentEval + 6) / 12));
  return (
    <div className="w-4 bg-gray-700 rounded-lg overflow-hidden flex flex-col h-full border border-white/10 relative">
      <div
        className="bg-[#ebecd0] transition-all duration-500 ease-in-out w-full absolute top-0"
        style={{ height: `${(1 - evalRatio) * 100}%` }}
      />
      <div
        className="bg-[#7fa650] transition-all duration-500 ease-in-out w-full absolute bottom-0"
        style={{ height: `${evalRatio * 100}%` }}
      />
    </div>
  );
};

/**
 * Chess.com-style move classification.
 *
 * The primary signal is **win-probability loss** (wpl, 0-100 percentage points).
 * Chess.com thresholds (reverse-engineered from their Game Review):
 *   Blunder  ≥ 20 wpl
 *   Mistake  ≥ 10 wpl
 *   Inaccuracy ≥ 5 wpl  (sometimes shown from ~4-5)
 *   Miss     — not used here (would require knowing if a forced win was missed)
 *
 * Positive categories additionally use cpLoss and contextual signals:
 *   Best       — engine's #1 move (cpLoss ≈ 0)
 *   Excellent  — near-best, wpl < 2
 *   Good       — acceptable, wpl < 5 (mapped to "excellent" in our type system)
 *   Great      — strong move with meaningful positive eval swing
 *   Brilliant  — hard-to-find best move in a critical/uncertain position
 *                where the second-best alternative is significantly worse;
 *                capped to be very rare (typically 0-2 per game)
 */
const classifyMove = (data: {
  isBook: boolean;
  isBest: boolean;
  cpLoss: number;
  evalSwing: number;
  winProbLoss: number;
  prevWP: number;
}): Classification => {
  if (data.isBook) return "book";

  const wpl = data.winProbLoss; // percentage points lost (0-100)

  // --- Negative classifications (bad moves) ---
  if (wpl >= 20) return "blunder";
  if (wpl >= 10) return "mistake";
  if (wpl >= 5) return "inaccuracy";

  // --- Positive classifications (good moves) ---

  // Best: the engine's top choice with negligible loss
  if (data.isBest && wpl < 1) return "best";

  // Brilliant: the best (or near-best) move that is hard to find.
  // Requirements (chess.com inspired):
  //  1. Near-zero loss (cpLoss ≤ 10, wpl < 2)
  //  2. Large positive eval swing (≥ 150 cp) — a tactic / sacrifice
  //  3. Position was critical/uncertain (prevWP between 20%-80%)
  //     meaning neither side was already winning comfortably
  const positionUncertainty = Math.min(data.prevWP, 1 - data.prevWP);
  if (
    data.cpLoss <= 10 &&
    wpl < 2 &&
    data.evalSwing >= 150 &&
    positionUncertainty >= 0.2
  ) {
    return "brilliant";
  }

  // Great: a strong move with a noticeable positive shift
  // Requirements:
  //  1. Low loss (cpLoss ≤ 15, wpl < 3)
  //  2. Positive eval swing ≥ 80 cp
  if (data.cpLoss <= 15 && wpl < 3 && data.evalSwing >= 80) {
    return "great";
  }

  // Excellent: accurate move, very close to the best
  if (wpl < 2) return "excellent";

  // Fallback for wpl 2-5 range — still "excellent" in our type system
  // (chess.com shows "Good" here, but we don't have that category)
  return "excellent";
};

const parsePgnHeaders = (pgn: string): Record<string, string> => {
  const headers: Record<string, string> = {};
  pgn.split(/\r?\n/).forEach((line) => {
    const match = line.match(/^\[(\w+)\s+"(.*)"\]$/);
    if (match) {
      headers[match[1]] = match[2];
    }
  });
  return headers;
};

const inferBoardOrientation = (
  game: ArchiveGame,
  username: string,
): "white" | "black" => {
  const headers = parsePgnHeaders(game.pgn);
  const normalize = (value: string) => value.trim().toLowerCase();
  const headerWhite = headers.White ?? "";
  const headerBlack = headers.Black ?? "";
  const apiWhite = game.white.username ?? "";
  const apiBlack = game.black.username ?? "";
  const user = normalize(username);

  if (user && normalize(headerWhite) === user) return "white";
  if (user && normalize(headerBlack) === user) return "black";
  if (user && normalize(apiWhite) === user) return "white";
  if (user && normalize(apiBlack) === user) return "black";

  return "white";
};

// ... other utils

export const Replayer = ({
  game,
  username,
}: {
  game: ArchiveGame | null;
  username: string;
}) => {
  const [moves, setMoves] = useState<MoveInfo[]>([]);
  const [analysis, setAnalysis] = useState<AnalyzedMove[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [openingName, setOpeningName] = useState<string | null>(null);
  const [status, setStatus] = useState("Waiting for game...");
  const [boardWidth, setBoardWidth] = useState(600);
  const [boardOrientation, setBoardOrientation] = useState<"white" | "black">(
    "white",
  );
  const [analysisMode, setAnalysisMode] = useState<
    "fast" | "balanced" | "deep"
  >("fast");
  const [engineReady, setEngineReady] = useState(false);
  const [engineProgress, setEngineProgress] = useState(0);

  const engineRef = useRef<ReturnType<typeof createStockfishEngine> | null>(
    null,
  );
  const analysisCacheRef = useRef(new Map<string, AnalyzedMove[]>());
  const boardWrapRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const analysisConfig = useMemo(
    () => ({
      fast: { depth: 10, movetime: 120, label: "Fast" },
      balanced: { depth: 12, movetime: 240, label: "Balanced" },
      deep: { depth: 14, movetime: 420, label: "Deep" },
    }),
    [],
  );

  const activeConfig = analysisConfig[analysisMode];

  // Helper: Play move sound
  const playMoveSound = (move: MoveInfo) => {
    const soundMap: { [key: string]: string } = {
      castle: "/sounds/castle.mp3",
      capture: "/sounds/capture.mp3",
      check: "/sounds/move-check.mp3",
      promotion: "/sounds/promote.mp3",
      normal: "/sounds/move-self.mp3",
    };

    let soundFile = soundMap.normal;
    if (move.isCastle) soundFile = soundMap.castle;
    else if (move.isCapture) soundFile = soundMap.capture;
    else if (move.isCheck) soundFile = soundMap.check;
    else if (move.isPromotion) soundFile = soundMap.promotion;

    if (audioRef.current) {
      audioRef.current.src = soundFile;
      audioRef.current.play().catch(() => {});
    }
  };

  // Helper: Get move icon
  const getMoveIcon = (classification: Classification): string => {
    const iconMap: { [key in Classification]: string } = {
      book: "/movements/book.png",
      best: "/movements/Best.png",
      brilliant: "/movements/brilliant.png",
      great: "/movements/great.png",
      excellent: "/movements/good.png",
      inaccuracy: "/movements/inaccurate.png",
      mistake: "/movements/mistake.png",
      blunder: "/movements/blunder.png",
    };
    return iconMap[classification];
  };

  useEffect(() => {
    setEngineProgress(0);
    setEngineReady(false);
    setStatus("Loading engine... 0%");

    // Simulate engine loading progress (slower for visibility)
    let progress = 0;
    const progressInterval = setInterval(() => {
      progress += 5; // Increment by 5% instead of 10%
      setEngineProgress(progress);
      setStatus(`Loading engine... ${progress}%`);
      if (progress >= 100) {
        clearInterval(progressInterval);
        setEngineReady(true);
        setStatus("Engine ready");
      }
    }, 150); // 150ms interval = 3 seconds total

    engineRef.current = createStockfishEngine();
    return () => {
      clearInterval(progressInterval);
      engineRef.current?.terminate();
    };
  }, []);

  // Parse moves when game changes
  useEffect(() => {
    if (!game) return;

    setBoardOrientation(inferBoardOrientation(game, username));

    const parseMovesPgn = (pgn: string): MoveInfo[] => {
      const chess = new Chess();
      try {
        chess.loadPgn(pgn);
      } catch {
        return [];
      }
      const verboseMoves = chess.history({ verbose: true });
      const replay = new Chess();
      return verboseMoves.map((move) => {
        const fenBefore = replay.fen();
        const color = replay.turn();
        const result = replay.move(move);
        const fenAfter = replay.fen();
        if (!result) throw new Error("Invalid move");
        return {
          san: move.san,
          uci: `${move.from}${move.to}${move.promotion ?? ""}`,
          fenBefore,
          fenAfter,
          color,
          isCapture: move.flags.includes("c"),
          isCheck: move.san.includes("+"),
          isCastle: move.flags.includes("k") || move.flags.includes("q"),
          isPromotion: move.flags.includes("p"),
        };
      });
    };

    const parsed = parseMovesPgn(game.pgn);
    setMoves(parsed);
    setAnalysis([]);
    setCurrentIndex(0);
    setStatus(`Analyzing with Stockfish (${activeConfig.label})...`);

    // FIX: Call opening detection immediately with move SANs
    const sanList = parsed.map((m) => m.san);
    const detectedOpening = getOpeningName(sanList);
    console.log("[Opening Detection] Immediate result:", detectedOpening);
    setOpeningName(detectedOpening);
  }, [game, activeConfig, username]);

  // Analysis Effect
  useEffect(() => {
    if (!moves.length || !engineRef.current || !game) return;

    let cancelled = false;
    const cacheKey = `${game.url}:${analysisMode}`;
    const cached = analysisCacheRef.current.get(cacheKey);

    if (cached) {
      setAnalysis(cached);
      setStatus("Analysis loaded from cache");

      // Update opening name immediately if cached
      const sanList = cached.map((m) => m.san);
      setOpeningName(getOpeningName(sanList));
      return;
    }

    const analyze = async () => {
      const engine = engineRef.current;
      if (!engine) return;

      // Clear hash once per game analysis, not per move
      engine.newGame();

      const results: AnalyzedMove[] = [];
      const sanList = moves.map((m) => m.san);

      for (let i = 0; i < moves.length; i++) {
        if (cancelled) return;
        const move = moves[i];

        let best, after;
        try {
          best = await engine.analyzeFen(move.fenBefore, activeConfig);
          after = await engine.analyzeFen(move.fenAfter, activeConfig);
        } catch (e) {
          console.error(e);
          if (!cancelled) {
            setStatus("Engine error. Try reloading the analysis.");
          }
          return;
        }

        // CRITICAL: Stockfish always reports from side-to-move's POV.
        // fenBefore side-to-move = move.color
        // fenAfter  side-to-move = opponent
        const opponent = move.color === "w" ? "b" : "w";
        const bestWhiteCp = evalWhitePov(best.score, move.color);
        const afterWhiteCp = evalWhitePov(after.score, opponent as "w" | "b");

        // cpLoss from the mover's perspective (positive = bad)
        const moverSign = move.color === "w" ? 1 : -1;
        const bestForMover = bestWhiteCp * moverSign;
        const afterForMover = afterWhiteCp * moverSign;
        const cpLoss = Math.max(0, bestForMover - afterForMover);
        const evalSwing = afterForMover - bestForMover;

        // Win probability loss (from mover's perspective)
        const wpBefore =
          move.color === "w"
            ? evalToWinProb(bestWhiteCp)
            : 1 - evalToWinProb(bestWhiteCp);
        const wpAfter =
          move.color === "w"
            ? evalToWinProb(afterWhiteCp)
            : 1 - evalToWinProb(afterWhiteCp);
        const winProbLoss = Math.max(0, (wpBefore - wpAfter) * 100);

        const isBest = best.bestMove.startsWith(move.uci);
        const isBook = isBookMove(sanList, i);

        const classification = classifyMove({
          isBook,
          isBest,
          cpLoss,
          evalSwing,
          winProbLoss,
          prevWP: wpBefore,
        });

        results.push({
          ...move,
          bestMove: best.bestMove,
          bestScore: best.score,
          afterScore: after.score,
          cpLoss,
          classification,
        });

        // Progressive update
        if (i % 5 === 0) setAnalysis([...results]);
      }

      if (!cancelled) {
        analysisCacheRef.current.set(cacheKey, results);
        setAnalysis(results);
        setStatus("Analysis Complete");
        const sanListFinal = results.map((m) => m.san);
        const opening = getOpeningName(sanListFinal);
        console.log("Calculated Opening:", opening);
        setOpeningName(opening);
      }
    };
    analyze();
    return () => {
      cancelled = true;
    };
  }, [moves, game, analysisMode, activeConfig]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight")
        setCurrentIndex((prev) => Math.min(prev + 1, moves.length));
      if (e.key === "ArrowLeft")
        setCurrentIndex((prev) => Math.max(prev - 1, 0));
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [moves.length]);

  // Play sound when navigating moves
  useEffect(() => {
    if (currentIndex > 0 && currentIndex <= moves.length) {
      const move = moves[currentIndex - 1];
      if (move) playMoveSound(move);
    }
  }, [currentIndex, moves]);

  // Responsive Board
  useEffect(() => {
    if (!boardWrapRef.current) return;
    const resizeObserver = new ResizeObserver(() => {
      if (boardWrapRef.current) {
        const containerWidth = boardWrapRef.current.offsetWidth;
        const viewportWidth = window.innerWidth;
        const maxWidth = Math.min(containerWidth, viewportWidth - 32, 600);
        setBoardWidth(Math.max(240, maxWidth));
      }
    });
    resizeObserver.observe(boardWrapRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  const currentFen = useMemo(() => {
    if (currentIndex === 0) return new Chess().fen();
    return moves[currentIndex - 1]?.fenAfter || new Chess().fen();
  }, [currentIndex, moves]);

  // Calculate best move arrow
  const bestMoveArrow = useMemo((): any[] => {
    if (!analysis.length || !engineReady || currentIndex === 0) return [];
    const moveIndex = currentIndex - 1;
    if (moveIndex < 0 || moveIndex >= analysis.length) return [];

    const analyzedMove = analysis[moveIndex];
    if (!analyzedMove || !analyzedMove.bestMove) return [];

    // Convert UCI format (e.g., "e2e4") to arrow format
    const from = analyzedMove.bestMove.slice(0, 2);
    const to = analyzedMove.bestMove.slice(2, 4);

    return [[from, to]];
  }, [analysis, engineReady, currentIndex]);

  // Custom square styles to show classification icon on destination square
  const customSquareStyles = useMemo(() => {
    if (!engineReady || currentIndex === 0 || !analysis.length) return {};

    const moveIndex = currentIndex - 1;
    if (
      moveIndex < 0 ||
      moveIndex >= moves.length ||
      moveIndex >= analysis.length
    )
      return {};

    const move = moves[moveIndex];
    const analyzedMove = analysis[moveIndex];
    if (!move || !analyzedMove) return {};

    // Get destination square from move (e.g., "e4" from "e2e4")
    const destSquare = move.uci.slice(2, 4);
    const iconUrl = getMoveIcon(analyzedMove.classification);

    return {
      [destSquare]: {
        backgroundImage: `url(${iconUrl})`,
        backgroundSize: "30% 30%",
        backgroundPosition: "top right",
        backgroundRepeat: "no-repeat",
      },
    };
  }, [engineReady, currentIndex, moves, analysis]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6 h-auto lg:h-[calc(100vh-6rem)]">
      {/* Main Board Area */}
      <div className="lg:col-span-8 flex flex-col gap-4">
        {/* Header with Opening Name */}
        <div className="bg-[#1a2332] p-3 sm:p-4 rounded-xl shadow-lg border border-white/5 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
          <div className="flex items-center gap-4">
            <Link
              to="/"
              className="p-2 hover:bg-white/5 rounded-full text-gray-400 hover:text-white transition-colors"
            >
              <ArrowLeft size={20} />
            </Link>
            <div>
              <h2 className="text-xl font-bold text-white">
                {game
                  ? `${game.white.username} vs ${game.black.username}`
                  : "Select a game"}
              </h2>
              <p className="text-sm text-blue-400 font-mono mt-1">
                {openingName || "Unknown Opening"}
              </p>
            </div>
          </div>
          <div className="flex gap-3 items-center">
            {/* Engine Loading Indicator */}
            {!engineReady && (
              <div className="flex items-center gap-2">
                <div className="w-32 h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-300"
                    style={{ width: `${engineProgress}%` }}
                  />
                </div>
                <span className="text-xs text-gray-400">{engineProgress}%</span>
              </div>
            )}
            <select
              value={analysisMode}
              onChange={(e) => setAnalysisMode(e.target.value as any)}
              className="bg-[#0f1219] border border-white/10 rounded px-2 py-1 text-xs text-gray-300"
            >
              <option value="fast">Fast</option>
              <option value="balanced">Balanced</option>
              <option value="deep">Deep</option>
            </select>
          </div>
        </div>

        {/* Board */}
        <div
          className="flex-1 bg-[#1a2332] rounded-xl shadow-lg border border-white/5 flex flex-col md:flex-row items-center justify-center p-3 sm:p-4 relative gap-4"
          ref={boardWrapRef}
        >
          {/* Eval Bar */}
          <div className="h-[90%] hidden md:block">
            <EvalBar
              currentEval={(() => {
                if (!analysis.length || currentIndex === 0) return 0;
                const index = Math.min(currentIndex - 1, analysis.length - 1);
                const move = analysis[index];
                if (!move) return 0;
                // afterScore is from side-to-move POV after this move,
                // i.e. the opponent's POV. Normalize to White's POV.
                const opponent = move.color === "w" ? "b" : "w";
                return (
                  evalWhitePov(move.afterScore, opponent as "w" | "b") / 100
                );
              })()}
            />
          </div>

          <Chessboard
            position={currentFen}
            boardWidth={boardWidth}
            boardOrientation={boardOrientation}
            customArrows={bestMoveArrow}
            customSquareStyles={customSquareStyles}
            customDarkSquareStyle={{ backgroundColor: "#3a4a63" }}
            customLightSquareStyle={{ backgroundColor: "#8faecf" }}
          />
        </div>

        {/* Controls */}
        <div className="bg-[#1a2332] p-3 sm:p-4 rounded-xl flex justify-center gap-3 sm:gap-4">
          <button
            onClick={() => setCurrentIndex(0)}
            className="text-gray-400 hover:text-white"
          >
            <Rewind />
          </button>
          <button
            onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
            className="text-gray-400 hover:text-white"
          >
            <ArrowLeft />
          </button>
          <button
            onClick={() =>
              setCurrentIndex((prev) => Math.min(moves.length, prev + 1))
            }
            className="text-gray-400 hover:text-white"
          >
            <ArrowRight />
          </button>
          <button
            onClick={() => setCurrentIndex(moves.length)}
            className="text-gray-400 hover:text-white"
          >
            <FastForward />
          </button>
        </div>
      </div>

      {/* Sidebar / Move List */}
      <div className="lg:col-span-4 bg-[#1a2332] rounded-xl shadow-lg border border-white/5 flex flex-col overflow-hidden min-h-[240px]">
        <div className="p-4 border-b border-white/10 bg-[#111620]">
          <h3 className="font-bold text-gray-200">Moves & Analysis</h3>
          <p className="text-xs text-gray-500">{status}</p>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {moves.map((move, i) => {
            if (i % 2 !== 0) return null; // Render pairs
            const whiteMove = move;
            const blackMove = moves[i + 1];
            const moveNum = Math.floor(i / 2) + 1;

            return (
              <div key={i} className="flex text-sm group">
                <div className="w-8 text-gray-500 font-mono py-1 text-center">
                  {moveNum}.
                </div>
                <div
                  className={`flex-1 py-1 px-2 rounded hover:bg-white/5 cursor-pointer flex justify-between items-center ${currentIndex === i + 1 ? "bg-blue-500/20 text-blue-300" : "text-gray-300"}`}
                  onClick={() => setCurrentIndex(i + 1)}
                >
                  <span>{whiteMove.san}</span>
                  {analysis[i] && engineReady && (
                    <img
                      src={getMoveIcon(analysis[i].classification)}
                      alt=""
                      className="w-4 h-4"
                      title={analysis[i].classification}
                    />
                  )}
                </div>
                <div
                  className={`flex-1 py-1 px-2 rounded hover:bg-white/5 cursor-pointer flex justify-between items-center ${currentIndex === i + 2 ? "bg-blue-500/20 text-blue-300" : "text-gray-300"}`}
                  onClick={() => blackMove && setCurrentIndex(i + 2)}
                >
                  <span>{blackMove?.san || ""}</span>
                  {blackMove && analysis[i + 1] && engineReady && (
                    <img
                      src={getMoveIcon(analysis[i + 1].classification)}
                      alt=""
                      className="w-4 h-4"
                      title={analysis[i + 1].classification}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Hidden audio element for sound playback */}
      <audio ref={audioRef} preload="auto" />
    </div>
  );
};
