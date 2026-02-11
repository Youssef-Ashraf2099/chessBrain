import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import { createStockfishEngine } from "../engine/stockfish";
import { isBookMove, getOpeningName } from "../lib/openings";
import type { ArchiveGame, MoveInfo, AnalyzedMove, EvalScore, Classification } from "../types";
import { ArrowLeft, ArrowRight, FastForward, Rewind } from "lucide-react";

// --- Types (Temporary, should be moved to src/types.ts) ---
// const scoreToCp... etc util functions need to be imported or duplicated. 
// For this refactor, I will assumed we moved utils to src/lib/chessUtils.ts or similar.
// But to avoid too many file creations in one go, I'll inline them here or copy them.

const scoreToCp = (score: EvalScore) => {
  if (score.type === "cp") {
    return score.value;
  }
  return Math.sign(score.value) * 100000;
};

const evalForPlayer = (score: EvalScore, player: "w" | "b") => {
  const cp = scoreToCp(score);
  return player === "w" ? cp : -cp;
};

// Start of EvalBar component (inline for now)
const EvalBar = ({ currentEval }: { currentEval: number }) => {
  const evalRatio = Math.min(1, Math.max(0, (currentEval + 6) / 12));
  return (
    <div className="w-4 bg-gray-700 rounded-lg overflow-hidden flex flex-col h-full border border-white/10 relative">
        <div className="bg-[#ebecd0] transition-all duration-500 ease-in-out w-full absolute top-0" style={{ height: `${(1 - evalRatio) * 100}%` }} />
        <div className="bg-[#7fa650] transition-all duration-500 ease-in-out w-full absolute bottom-0" style={{ height: `${evalRatio * 100}%` }} />
    </div>
  );
};

const classifyMove = (data: {
  isBook: boolean;
  isBest: boolean;
  cpLoss: number;
  evalSwing: number;
}): Classification => {
  if (data.isBook) return "book";
  if (data.isBest) return "best";
  
  // Tightened criteria for more accurate classifications
  if (data.cpLoss > 100) return "blunder";        // Major mistake (>1 pawn)
  if (data.cpLoss > 50) return "mistake";          // Significant error (>0.5 pawn)
  if (data.cpLoss > 20) return "inaccuracy";       // Minor error (>0.2 pawn)
  
  // Brilliant: Only for moves with minimal loss AND significant positive swing
  if (data.cpLoss <= 5 && data.evalSwing >= 200) return "brilliant";
  
  // Great: Low loss with good positive impact
  if (data.cpLoss <= 10 && data.evalSwing >= 100) return "great";
  
  // Excellent: Accurate move with minimal loss
  if (data.cpLoss <= 20) return "excellent";
  
  return "excellent"; // Fallback
};

// ... other utils

export const Replayer = ({ game }: { game: ArchiveGame | null }) => {
  const [moves, setMoves] = useState<MoveInfo[]>([]);
  const [analysis, setAnalysis] = useState<AnalyzedMove[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [openingName, setOpeningName] = useState<string | null>(null);
  const [status, setStatus] = useState("Waiting for game...");
  const [boardWidth, setBoardWidth] = useState(600);
  const [analysisMode, setAnalysisMode] = useState<"fast" | "balanced" | "deep">("fast");
  const [engineReady, setEngineReady] = useState(false);
  const [engineProgress, setEngineProgress] = useState(0);
  
  const engineRef = useRef<ReturnType<typeof createStockfishEngine> | null>(null);
  const analysisCacheRef = useRef(new Map<string, AnalyzedMove[]>());
  const boardWrapRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const analysisConfig = useMemo(() => ({
      fast: { depth: 9, movetime: 90, label: "Fast" },
      balanced: { depth: 11, movetime: 180, label: "Balanced" },
      deep: { depth: 13, movetime: 360, label: "Deep" },
  }), []);
  
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
    
    const parseMovesPgn = (pgn: string): MoveInfo[] => {
       const chess = new Chess();
       try { chess.loadPgn(pgn); } catch { return []; }
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
    const sanList = parsed.map(m => m.san);
    const detectedOpening = getOpeningName(sanList);
    console.log("[Opening Detection] Immediate result:", detectedOpening);
    setOpeningName(detectedOpening);

  }, [game, activeConfig]);

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
      const results: AnalyzedMove[] = [];
      const sanList = moves.map(m => m.san);

      for (let i = 0; i < moves.length; i++) {
        if (cancelled || !engine) return;
        const move = moves[i];
        
        // ... (analysis logic same as App.tsx)
        let best, after;
        try {
            best = await engine.analyzeFen(move.fenBefore, activeConfig);
            after = await engine.analyzeFen(move.fenAfter, activeConfig);
        } catch (e) {
            // setEngineError("Engine Error"); 
            console.error(e);
            return;
        }
        
        const bestEval = evalForPlayer(best.score, move.color);
        const afterEval = evalForPlayer(after.score, move.color);
        const cpLoss = Math.max(0, bestEval - afterEval);
        const evalSwing = afterEval - bestEval; 
        const isBest = best.bestMove.startsWith(move.uci);
        const isBook = isBookMove(sanList, i);
        
        const classification = classifyMove({ isBook, isBest, cpLoss, evalSwing });
        
        results.push({
            ...move,
            bestMove: best.bestMove,
            bestScore: best.score,
            afterScore: after.score,
            cpLoss,
            classification
        });
        
        // Progressive update (optional, but good for UX)
        if (i % 5 === 0) setAnalysis([...results]); 
      }
      
      if (!cancelled) {
          analysisCacheRef.current.set(cacheKey, results);
          setAnalysis(results);
          setStatus("Analysis Complete");
          const sanListFinal = results.map(m => m.san);
          const opening = getOpeningName(sanListFinal);
          console.log("Calculated Opening:", opening);
          setOpeningName(opening);
      }
    };
    analyze();
    return () => { cancelled = true; };
  }, [moves, game, analysisMode, activeConfig]);

  // Keyboard navigation
  useEffect(() => {
      const handler = (e: KeyboardEvent) => {
          if (e.key === "ArrowRight") setCurrentIndex(prev => Math.min(prev + 1, moves.length));
          if (e.key === "ArrowLeft") setCurrentIndex(prev => Math.max(prev - 1, 0));
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
              setBoardWidth(Math.min(boardWrapRef.current.offsetWidth, 600));
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
  const bestMoveArrow = useMemo(():any[] => {
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
    if (moveIndex < 0 || moveIndex >= moves.length || moveIndex >= analysis.length) return {};
    
    const move = moves[moveIndex];
    const analyzedMove = analysis[moveIndex];
    if (!move || !analyzedMove) return {};
    
    // Get destination square from move (e.g., "e4" from "e2e4")
    const destSquare = move.uci.slice(2, 4);
    const iconUrl = getMoveIcon(analyzedMove.classification);
    
    return {
      [destSquare]: {
        backgroundImage: `url(${iconUrl})`,
        backgroundSize: '30% 30%',
        backgroundPosition: 'top right',
        backgroundRepeat: 'no-repeat',
      }
    };
  }, [engineReady, currentIndex, moves, analysis]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-6rem)]">
      {/* Main Board Area */}
      <div className="lg:col-span-8 flex flex-col gap-4">
        
        {/* Header with Opening Name */}
        <div className="bg-[#1a2332] p-4 rounded-xl shadow-lg border border-white/5 flex justify-between items-center">
             <div className="flex items-center gap-4">
                 <Link to="/" className="p-2 hover:bg-white/5 rounded-full text-gray-400 hover:text-white transition-colors">
                    <ArrowLeft size={20} />
                 </Link>
                 <div>
                     <h2 className="text-xl font-bold text-white">
                        {game ? `${game.white.username} vs ${game.black.username}` : "Select a game"}
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
        <div className="flex-1 bg-[#1a2332] rounded-xl shadow-lg border border-white/5 flex items-center justify-center p-4 relative gap-4" ref={boardWrapRef}>
             {/* Eval Bar */}
             <div className="h-[90%] hidden md:block">
                 <EvalBar currentEval={(() => {
                    if (!analysis.length) return 0;
                    const index = Math.min(Math.max(currentIndex - 1, 0), analysis.length - 1);
                    const move = analysis[index];
                    return move ? scoreToCp(move.afterScore) / 100 : 0;
                 })()} />
             </div>

             <Chessboard   
                position={currentFen} 
                boardWidth={boardWidth}
                customArrows={bestMoveArrow}
                customSquareStyles={customSquareStyles}
                customDarkSquareStyle={{ backgroundColor: "#3a4a63" }}
                customLightSquareStyle={{ backgroundColor: "#8faecf" }}
             />
        </div>

        {/* Controls */}
        <div className="bg-[#1a2332] p-4 rounded-xl flex justify-center gap-4">
            <button onClick={() => setCurrentIndex(0)} className="text-gray-400 hover:text-white"><Rewind /></button>
            <button onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))} className="text-gray-400 hover:text-white"><ArrowLeft /></button>
            <button onClick={() => setCurrentIndex(prev => Math.min(moves.length, prev + 1))} className="text-gray-400 hover:text-white"><ArrowRight /></button>
            <button onClick={() => setCurrentIndex(moves.length)} className="text-gray-400 hover:text-white"><FastForward /></button>
        </div>
      </div>

      {/* Sidebar / Move List */}
      <div className="lg:col-span-4 bg-[#1a2332] rounded-xl shadow-lg border border-white/5 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-white/10 bg-[#111620]">
              <h3 className="font-bold text-gray-200">Moves & Analysis</h3>
              <p className="text-xs text-gray-500">{status}</p>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {moves.map((move, i) => {
                  if (i % 2 !== 0) return null; // Render pairs
                  const whiteMove = move;
                  const blackMove = moves[i+1];
                  const moveNum = Math.floor(i / 2) + 1;
                  
                  return (
                      <div key={i} className="flex text-sm group">
                          <div className="w-8 text-gray-500 font-mono py-1 text-center">{moveNum}.</div>
                          <div 
                             className={`flex-1 py-1 px-2 rounded hover:bg-white/5 cursor-pointer flex justify-between items-center ${currentIndex === i + 1 ? "bg-blue-500/20 text-blue-300" : "text-gray-300"}`}
                             onClick={() => setCurrentIndex(i + 1)}
                          >
                              <span>{whiteMove.san}</span>
                              {analysis[i] && engineReady && (
                                <img src={getMoveIcon(analysis[i].classification)} alt="" className="w-4 h-4" title={analysis[i].classification} />
                              )}
                          </div>
                          <div 
                             className={`flex-1 py-1 px-2 rounded hover:bg-white/5 cursor-pointer flex justify-between items-center ${currentIndex === i + 2 ? "bg-blue-500/20 text-blue-300" : "text-gray-300"}`}
                             onClick={() => blackMove && setCurrentIndex(i + 2)}
                          >
                              <span>{blackMove?.san || ""}</span>
                              {blackMove && analysis[i + 1] && engineReady && (
                                <img src={getMoveIcon(analysis[i + 1].classification)} alt="" className="w-4 h-4" title={analysis[i + 1].classification} />
                              )}
                          </div>
                      </div>
                  )
              })}
          </div>
      </div>
      
      {/* Hidden audio element for sound playback */}
      <audio ref={audioRef} preload="auto" />
    </div>
  );
};
