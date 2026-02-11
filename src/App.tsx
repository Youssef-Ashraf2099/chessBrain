import { useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import { createStockfishEngine } from "./engine/stockfish";
import { isBookMove } from "./lib/openings";

type ArchiveGame = {
  pgn: string;
  end_time: number;
  url: string;
  white: { username: string; result: string };
  black: { username: string; result: string };
};

type MoveInfo = {
  san: string;
  uci: string;
  fenBefore: string;
  fenAfter: string;
  color: "w" | "b";
  isCapture: boolean;
  isCheck: boolean;
  isCastle: boolean;
  isPromotion: boolean;
};

type EvalScore = {
  type: "cp" | "mate";
  value: number;
};

type Classification =
  | "book"
  | "best"
  | "brilliant"
  | "great"
  | "excellent"
  | "inaccuracy"
  | "mistake"
  | "blunder";

type AnalyzedMove = MoveInfo & {
  bestMove: string;
  bestScore: EvalScore;
  afterScore: EvalScore;
  cpLoss: number;
  classification: Classification;
};

const USERNAME = "Youssef-2099";
const ARCHIVES_URL = `https://api.chess.com/pub/player/${USERNAME}/games/archives`;

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

const classifyMove = (data: {
  isBook: boolean;
  isBest: boolean;
  cpLoss: number;
  evalSwing: number;
}): Classification => {
  if (data.isBook) {
    return "book";
  }
  if (data.isBest) {
    return "best";
  }
  if (data.cpLoss > 200) {
    return "blunder";
  }
  if (data.cpLoss > 100) {
    return "mistake";
  }
  if (data.cpLoss > 50) {
    return "inaccuracy";
  }
  if (data.cpLoss <= 10 && data.evalSwing >= 150) {
    return "brilliant";
  }
  if (data.cpLoss <= 10) {
    return "great";
  }
  return "excellent";
};

const accuracyFromLoss = (losses: number[]) => {
  if (losses.length === 0) {
    return 0;
  }
  const avg = losses.reduce((sum, value) => sum + value, 0) / losses.length;
  return Math.max(0, Math.min(100, 100 - avg / 10));
};

const coachTextForAccuracy = (accuracy: number) => {
  if (accuracy >= 90) {
    return `You played with ${accuracy.toFixed(1)}% accuracy. Outstanding game!`;
  }
  if (accuracy >= 80) {
    return `You played with ${accuracy.toFixed(1)}% accuracy. You had a great game!`;
  }
  if (accuracy >= 70) {
    return `You played with ${accuracy.toFixed(1)}% accuracy. Solid effort.`;
  }
  return `You played with ${accuracy.toFixed(1)}% accuracy. Keep practicing.`;
};

const parseMoves = (pgn: string): MoveInfo[] => {
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

    if (!result) {
      throw new Error("Invalid move in PGN");
    }

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

const extractTag = (pgn: string, tag: string) => {
  const regex = new RegExp(`\\[${tag} \"([^\"]+)\"\\]`);
  const match = pgn.match(regex);
  return match ? match[1] : "";
};

const getAllGames = async (): Promise<ArchiveGame[]> => {
  const archivesResponse = await fetch(ARCHIVES_URL);
  if (!archivesResponse.ok) {
    return [];
  }
  const archivesData = (await archivesResponse.json()) as {
    archives: string[];
  };
  if (!archivesData.archives.length) {
    return [];
  }
  const games = await Promise.all(
    archivesData.archives.map(async (archiveUrl) => {
      const gamesResponse = await fetch(archiveUrl);
      if (!gamesResponse.ok) {
        return [];
      }
      const gamesData = (await gamesResponse.json()) as {
        games: ArchiveGame[];
      };
      return gamesData.games;
    }),
  );
  return games.flat().sort((a, b) => b.end_time - a.end_time);
};

const getLatestGame = async (): Promise<ArchiveGame | null> => {
  const archivesResponse = await fetch(ARCHIVES_URL);
  if (!archivesResponse.ok) {
    return null;
  }
  const archivesData = (await archivesResponse.json()) as {
    archives: string[];
  };
  const latestArchive = archivesData.archives.at(-1);
  if (!latestArchive) {
    return null;
  }
  const gamesResponse = await fetch(latestArchive);
  if (!gamesResponse.ok) {
    return null;
  }
  const gamesData = (await gamesResponse.json()) as { games: ArchiveGame[] };
  return (
    [...gamesData.games].sort((a, b) => b.end_time - a.end_time)[0] ?? null
  );
};

const getResultLabel = (game: ArchiveGame, username: string) => {
  const isWhite = game.white.username.toLowerCase() === username.toLowerCase();
  const you = isWhite ? game.white.result : game.black.result;
  const drawResults = new Set([
    "agreed",
    "repetition",
    "stalemate",
    "insufficient",
    "50move",
    "timevsinsufficient",
  ]);
  if (you === "win") {
    return "W";
  }
  if (drawResults.has(you)) {
    return "D";
  }
  return "L";
};

const formatGameLabel = (game: ArchiveGame) => {
  const date = new Date(game.end_time * 1000);
  const opponent =
    game.white.username.toLowerCase() === USERNAME.toLowerCase()
      ? game.black.username
      : game.white.username;
  const result = getResultLabel(game, USERNAME);
  return `${date.toLocaleDateString()} vs ${opponent} (${result})`;
};

const useAudioBank = () => {
  const sounds = useRef({
    move: new Audio("/sounds/move-self.mp3"),
    check: new Audio("/sounds/move-check.mp3"),
    capture: new Audio("/sounds/capture.mp3"),
    castle: new Audio("/sounds/castle.mp3"),
    promote: new Audio("/sounds/promote.mp3"),
    end: new Audio("/sounds/move-check.mp3"),
  });

  sounds.current.move.preload = "none";
  sounds.current.check.preload = "none";
  sounds.current.capture.preload = "none";
  sounds.current.castle.preload = "none";
  sounds.current.promote.preload = "none";
  sounds.current.end.preload = "none";

  return sounds.current;
};

const useInstallPrompt = () => {
  const [installEvent, setInstallEvent] =
    useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);

  return installEvent;
};

const App = () => {
  const [game, setGame] = useState<ArchiveGame | null>(null);
  const [moves, setMoves] = useState<MoveInfo[]>([]);
  const [analysis, setAnalysis] = useState<AnalyzedMove[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [status, setStatus] = useState("Loading latest game...");
  const [newGameReady, setNewGameReady] = useState(false);
  const [latestGameId, setLatestGameId] = useState("");
  const [recentGames, setRecentGames] = useState<ArchiveGame[]>([]);
  const [selectedGameUrl, setSelectedGameUrl] = useState("");
  const [progress, setProgress] = useState(0);
  const [whiteAccuracy, setWhiteAccuracy] = useState(0);
  const [blackAccuracy, setBlackAccuracy] = useState(0);
  const [boardWidth, setBoardWidth] = useState(520);
  const [engineError, setEngineError] = useState("");
  const [analysisMode, setAnalysisMode] = useState<
    "fast" | "balanced" | "deep"
  >("balanced");
  const engineRef = useRef<ReturnType<typeof createStockfishEngine> | null>(
    null,
  );
  const analysisCacheRef = useRef(new Map<string, AnalyzedMove[]>());
  const boardWrapRef = useRef<HTMLDivElement | null>(null);
  const sounds = useAudioBank();
  const installEvent = useInstallPrompt();

  const analysisConfig = useMemo(
    () => ({
      fast: { depth: 10, movetime: 140, label: "Fast" },
      balanced: { depth: 12, movetime: 260, label: "Balanced" },
      deep: { depth: 14, movetime: 520, label: "Deep" },
    }),
    [],
  );
  const activeConfig = analysisConfig[analysisMode];

  useEffect(() => {
    engineRef.current = createStockfishEngine();
    return () => {
      engineRef.current?.terminate();
    };
  }, []);

  useEffect(() => {
    const load = async () => {
      const allGames = await getAllGames();
      if (!allGames.length) {
        setStatus("Unable to load games. Check your connection.");
        return;
      }
      setRecentGames(allGames);
      const latest = allGames[0];
      if (!latest) {
        return;
      }
      setLatestGameId(latest.url);
      setSelectedGameUrl((value) => value || latest.url);
      setGame(latest);
    };

    load();
  }, []);

  useEffect(() => {
    const interval = window.setInterval(async () => {
      const latest = await getLatestGame();
      if (!latest) {
        return;
      }
      if (latest.url !== latestGameId) {
        setNewGameReady(true);
        setLatestGameId(latest.url);
        setRecentGames((prev) => [
          latest,
          ...prev.filter((item) => item.url !== latest.url),
        ]);
      }
      if (!selectedGameUrl || selectedGameUrl === latestGameId) {
        setSelectedGameUrl(latest.url);
        setGame(latest);
        setNewGameReady(false);
      }
    }, 60000);

    return () => {
      window.clearInterval(interval);
    };
  }, [latestGameId, selectedGameUrl]);

  useEffect(() => {
    if (!selectedGameUrl) {
      return;
    }
    const selected = recentGames.find((item) => item.url === selectedGameUrl);
    if (selected) {
      setGame(selected);
      if (selected.url === latestGameId) {
        setNewGameReady(false);
      }
    }
  }, [latestGameId, recentGames, selectedGameUrl]);

  useEffect(() => {
    if (!game) {
      return;
    }

    const parsedMoves = parseMoves(game.pgn);
    setMoves(parsedMoves);
    setAnalysis([]);
    setCurrentIndex(0);
    setProgress(0);
    setStatus(
      `Analyzing with Stockfish (${activeConfig.label}, depth ${activeConfig.depth})...`,
    );
  }, [activeConfig, game]);

  useEffect(() => {
    if (!moves.length || !engineRef.current || !game) {
      return;
    }

    let cancelled = false;
    const cacheKey = `${game.url}:${analysisMode}`;
    const cached = analysisCacheRef.current.get(cacheKey);
    if (cached) {
      setAnalysis(cached);
      setStatus("Analysis loaded");
      setProgress(100);
      const whiteLosses = cached
        .filter((item) => item.color === "w")
        .map((item) => item.cpLoss);
      const blackLosses = cached
        .filter((item) => item.color === "b")
        .map((item) => item.cpLoss);
      setWhiteAccuracy(accuracyFromLoss(whiteLosses));
      setBlackAccuracy(accuracyFromLoss(blackLosses));
      return;
    }

    const analyze = async () => {
      const engine = engineRef.current;
      const results: AnalyzedMove[] = [];
      const sanList = moves.map((move) => move.san);

      for (let i = 0; i < moves.length; i += 1) {
        if (cancelled || !engine) {
          return;
        }
        const move = moves[i];
        let best: Awaited<ReturnType<typeof engine.analyzeFen>>;
        let after: Awaited<ReturnType<typeof engine.analyzeFen>>;
        try {
          best = await engine.analyzeFen(move.fenBefore, activeConfig);
          after = await engine.analyzeFen(move.fenAfter, activeConfig);
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "Stockfish failed to analyze. Refresh the page.";
          setEngineError(message);
          setStatus("Engine error");
          return;
        }

        const bestEval = evalForPlayer(best.score, move.color);
        const afterEval = evalForPlayer(after.score, move.color);
        const cpLoss = Math.max(0, bestEval - afterEval);
        const evalSwing = afterEval - bestEval;
        const isBest = best.bestMove.startsWith(move.uci);
        const isBook = isBookMove(sanList, i);

        const classification = classifyMove({
          isBook,
          isBest,
          cpLoss,
          evalSwing,
        });

        results.push({
          ...move,
          bestMove: best.bestMove,
          bestScore: best.score,
          afterScore: after.score,
          cpLoss,
          classification,
        });

        setProgress(Math.round(((i + 1) / moves.length) * 100));
      }

      if (!cancelled) {
        analysisCacheRef.current.set(cacheKey, results);
        setAnalysis(results);
        setStatus("Analysis complete");
        setEngineError("");

        const whiteLosses = results
          .filter((item) => item.color === "w")
          .map((item) => item.cpLoss);
        const blackLosses = results
          .filter((item) => item.color === "b")
          .map((item) => item.cpLoss);
        setWhiteAccuracy(accuracyFromLoss(whiteLosses));
        setBlackAccuracy(accuracyFromLoss(blackLosses));
      }
    };

    analyze();

    return () => {
      cancelled = true;
    };
  }, [activeConfig, analysisMode, game, moves]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") {
        setCurrentIndex((value) => Math.min(value + 1, moves.length));
      }
      if (event.key === "ArrowLeft") {
        setCurrentIndex((value) => Math.max(value - 1, 0));
      }
    };

    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
    };
  }, [moves.length]);

  useEffect(() => {
    const element = boardWrapRef.current;
    if (!element) {
      return;
    }

    const updateSize = () => {
      const width = element.getBoundingClientRect().width;
      setBoardWidth(Math.max(260, Math.min(width, 520)));
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (currentIndex === 0 || currentIndex > moves.length) {
      return;
    }
    const move = moves[currentIndex - 1];
    if (!move) {
      return;
    }
    if (currentIndex === moves.length) {
      sounds.end.play();
      return;
    }
    if (move.isPromotion) {
      sounds.promote.play();
      return;
    }
    if (move.isCastle) {
      sounds.castle.play();
      return;
    }
    if (move.isCapture) {
      sounds.capture.play();
      return;
    }
    if (move.isCheck) {
      sounds.check.play();
      return;
    }
    sounds.move.play();
  }, [currentIndex, moves, sounds]);

  const boardFen = useMemo(() => {
    if (currentIndex === 0) {
      return new Chess().fen();
    }
    const move = moves[currentIndex - 1];
    return move ? move.fenAfter : new Chess().fen();
  }, [currentIndex, moves]);

  const currentEval = useMemo(() => {
    if (!analysis.length) {
      return 0;
    }
    const index = Math.min(Math.max(currentIndex - 1, 0), analysis.length - 1);
    const move = analysis[index];
    if (!move) {
      return 0;
    }
    return scoreToCp(move.afterScore) / 100;
  }, [analysis, currentIndex]);

  const evalRatio = Math.min(1, Math.max(0, (currentEval + 6) / 12));

  const activeBadge = useMemo(() => {
    if (currentIndex === 0) {
      return null;
    }
    const move = moves[currentIndex - 1];
    const evaluated = analysis[currentIndex - 1];
    if (!move || !evaluated) {
      return null;
    }
    const toSquare = move.uci.slice(2, 4);
    if (toSquare.length !== 2) {
      return null;
    }
    const fileIndex = toSquare.charCodeAt(0) - 97;
    const rankIndex = 8 - Number(toSquare[1]);
    if (fileIndex < 0 || fileIndex > 7 || rankIndex < 0 || rankIndex > 7) {
      return null;
    }
    const squareSize = boardWidth / 8;
    const badgeSize = Math.max(14, Math.round(squareSize * 0.28));
    const left = fileIndex * squareSize + squareSize * 0.82;
    const top = rankIndex * squareSize + squareSize * 0.06;
    const fontSize = Math.max(10, Math.round(badgeSize * 0.6));
    const classification = evaluated.classification;
    const label =
      classification === "book"
        ? "📖"
        : classification === "brilliant"
          ? "!!"
          : classification === "great"
            ? "!"
            : classification === "best"
              ? "★"
              : classification === "excellent"
                ? "★"
                : classification === "inaccuracy"
                  ? "?!"
                  : classification === "mistake"
                    ? "?"
                    : "??";
    return {
      left,
      top,
      label,
      classification,
      size: badgeSize,
      fontSize,
    };
  }, [analysis, boardWidth, currentIndex, moves]);

  const resultTag = game ? extractTag(game.pgn, "Result") : "";
  const whitePlayer = game ? game.white.username : "";
  const blackPlayer = game ? game.black.username : "";
  const youAreWhite = whitePlayer.toLowerCase() === USERNAME.toLowerCase();
  const youAreBlack = blackPlayer.toLowerCase() === USERNAME.toLowerCase();
  const winner =
    resultTag === "1-0" ? "white" : resultTag === "0-1" ? "black" : "draw";
  const youWon =
    (winner === "white" && youAreWhite) || (winner === "black" && youAreBlack);
  const gameEnded = resultTag !== "" && currentIndex === moves.length;

  const handleInstall = async () => {
    if (!installEvent) {
      return;
    }
    await installEvent.prompt();
  };

  const coachText = useMemo(() => {
    if (!analysis.length) {
      return "Analyzing your game...";
    }
    const youAccuracy = youAreWhite ? whiteAccuracy : blackAccuracy;
    return coachTextForAccuracy(youAccuracy);
  }, [analysis.length, blackAccuracy, whiteAccuracy, youAreWhite]);

  const labelForClassification = (classification: Classification) => {
    switch (classification) {
      case "book":
        return "BOOK";
      case "brilliant":
        return "BRILLIANT";
      case "great":
        return "GREAT";
      case "best":
        return "BEST";
      case "excellent":
        return "EXCELLENT";
      case "inaccuracy":
        return "INAC";
      case "mistake":
        return "MISTAKE";
      case "blunder":
        return "BLUNDER";
      default:
        return "";
    }
  };

  return (
    <div className="app">
      <header className="top-bar">
        <div>
          <h1>Chess Replay</h1>
          <p className="subtitle">Game Review for {USERNAME}</p>
        </div>
        {newGameReady ? (
          <button
            type="button"
            className="pill-button"
            onClick={() => {
              if (latestGameId) {
                setSelectedGameUrl(latestGameId);
              }
            }}
          >
            New Game Ready
          </button>
        ) : null}
      </header>

      <main className="layout">
        <section className="eval-bar">
          <div className="eval-bar-track">
            <div
              className="eval-bar-white"
              style={{ height: `${evalRatio * 100}%` }}
            />
            <div
              className="eval-bar-black"
              style={{ height: `${(1 - evalRatio) * 100}%` }}
            />
          </div>
          <div className="eval-value">
            {currentEval >= 0
              ? `+${currentEval.toFixed(2)}`
              : currentEval.toFixed(2)}
          </div>
        </section>

        <section className="board-panel">
          <div className="board-wrap" ref={boardWrapRef}>
            <Chessboard
              id="chess-review"
              position={boardFen}
              arePiecesDraggable={false}
              customLightSquareStyle={{ backgroundColor: "#EBECD0" }}
              customDarkSquareStyle={{ backgroundColor: "#779556" }}
              boardWidth={boardWidth}
              animationDuration={150}
            />
            {activeBadge ? (
              <div className="board-overlay">
                <div
                  className={`move-badge ${activeBadge.classification}`}
                  style={{
                    left: activeBadge.left,
                    top: activeBadge.top,
                    width: activeBadge.size,
                    height: activeBadge.size,
                    fontSize: activeBadge.fontSize,
                  }}
                >
                  {activeBadge.label}
                </div>
              </div>
            ) : null}
          </div>

          <div className="controls">
            <button type="button" onClick={() => setCurrentIndex(0)}>
              First
            </button>
            <button
              type="button"
              onClick={() => setCurrentIndex((value) => Math.max(0, value - 1))}
            >
              Prev
            </button>
            <button
              type="button"
              onClick={() =>
                setCurrentIndex((value) => Math.min(moves.length, value + 1))
              }
            >
              Next
            </button>
            <button type="button" onClick={() => setCurrentIndex(moves.length)}>
              Last
            </button>
          </div>

          <div className="status">
            <span>{status}</span>
            {analysis.length ? null : <span>{progress}%</span>}
          </div>
          {engineError ? (
            <div className="engine-error">{engineError}</div>
          ) : null}
        </section>

        <aside className="sidebar">
          <div className="game-select">
            <h2>Game</h2>
            <select
              value={selectedGameUrl}
              onChange={(event) => setSelectedGameUrl(event.target.value)}
            >
              {recentGames.map((item) => (
                <option key={item.url} value={item.url}>
                  {formatGameLabel(item)}
                </option>
              ))}
            </select>
          </div>
          <div className="coach">
            <h2>Coach</h2>
            <p>{coachText}</p>
            <div className="accuracy">
              <div>
                <span className="label">{whitePlayer || "White"}:</span>
                <span>{whiteAccuracy.toFixed(1)}%</span>
              </div>
              <div>
                <span className="label">{blackPlayer || "Black"}:</span>
                <span>{blackAccuracy.toFixed(1)}%</span>
              </div>
            </div>
          </div>

          <div className="settings">
            <button
              type="button"
              onClick={handleInstall}
              disabled={!installEvent}
            >
              Install App
            </button>
            <div className="settings-text">
              Add Chess Replay to your home screen.
            </div>
            <div className="settings-select">
              <label htmlFor="analysis-mode">Engine speed</label>
              <select
                id="analysis-mode"
                value={analysisMode}
                onChange={(event) =>
                  setAnalysisMode(
                    event.target.value as "fast" | "balanced" | "deep",
                  )
                }
              >
                <option value="fast">Fast</option>
                <option value="balanced">Balanced</option>
                <option value="deep">Deep</option>
              </select>
            </div>
          </div>

          <div className="moves">
            <h2>Move List</h2>
            <div className="move-list">
              {moves.map((move, index) => {
                const number = Math.floor(index / 2) + 1;
                const isActive = index + 1 === currentIndex;
                const evaluated = analysis[index];
                return (
                  <div
                    key={`${move.uci}-${index}`}
                    className={`move-row ${isActive ? "active" : ""}`}
                  >
                    <span className="move-number">
                      {index % 2 === 0 ? number : ""}
                    </span>
                    <span className="move-san">{move.san}</span>
                    {evaluated ? (
                      <span className={`tag ${evaluated.classification}`}>
                        <span className="tag-dot" />
                        <span className="tag-text">
                          {labelForClassification(evaluated.classification)}
                        </span>
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </aside>
      </main>

      {gameEnded ? (
        <div className="result-banner">
          <div className={`result-card ${youWon ? "win" : "loss"}`}>
            <div className="result-icon">
              {winner === "draw" ? "1/2-1/2" : youWon ? "👑" : "🚩"}
            </div>
            <h3>
              {winner === "draw"
                ? "Game Drawn"
                : youWon
                  ? "Victory for Youssef-2099"
                  : "Defeat for Youssef-2099"}
            </h3>
            <p>Result: {resultTag}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default App;
