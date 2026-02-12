type StockfishWorker = Worker & {
  postMessage: (message: string) => void;
};

type EvalScore = {
  type: "cp" | "mate";
  value: number;
};

type AnalysisResult = {
  bestMove: string;
  score: EvalScore;
};

type AnalyzeOptions = {
  depth?: number;
  movetime?: number;
};

type StockfishEngine = {
  analyzeFen: (fen: string, options: AnalyzeOptions) => Promise<AnalysisResult>;
  newGame: () => void;
  terminate: () => void;
};

const parseInfoLine = (
  line: string,
): { depth: number; pv: number; score: EvalScore } | null => {
  // Only accept lines with a depth and a score
  const depthMatch = line.match(/\bdepth (\d+)/);
  if (!depthMatch) return null;

  const pvMatch = line.match(/\bmultipv (\d+)/);
  const pv = pvMatch ? Number(pvMatch[1]) : 1;
  // Only track PV 1 (primary line)
  if (pv !== 1) return null;

  // Skip lowerbound / upperbound aspiration-window noise
  if (line.includes(" lowerbound") || line.includes(" upperbound")) return null;

  const cpMatch = line.match(/score cp (-?\d+)/);
  if (cpMatch) {
    return {
      depth: Number(depthMatch[1]),
      pv,
      score: { type: "cp", value: Number(cpMatch[1]) },
    };
  }

  const mateMatch = line.match(/score mate (-?\d+)/);
  if (mateMatch) {
    return {
      depth: Number(depthMatch[1]),
      pv,
      score: { type: "mate", value: Number(mateMatch[1]) },
    };
  }

  return null;
};

const createEngineInstance = (): StockfishEngine => {
  const worker = new Worker("/stockfish/stockfish-nnue-16-single.js", {
    type: "classic",
  }) as StockfishWorker;

  let ready = false;
  let currentResolve: ((result: AnalysisResult) => void) | null = null;
  let currentReject: ((error: Error) => void) | null = null;
  let bestMove = "";
  let bestScore: EvalScore | null = null;
  let bestDepth = 0;
  let readyTimer: number | null = null;
  let readyResolve: (() => void) | null = null;
  let searchTimer: number | null = null;
  let searchId = 0;

  const normalizeLine = (data: unknown) => {
    if (typeof data === "string") {
      return data.trim();
    }
    if (typeof (data as { data?: unknown })?.data === "string") {
      return ((data as { data?: string }).data ?? "").trim();
    }
    return String(data).trim();
  };

  worker.onmessage = (event: MessageEvent<string>) => {
    const line = normalizeLine(event.data);
    if (!line) {
      return;
    }

    if (line.includes("uciok")) {
      worker.postMessage("isready");
      return;
    }

    if (line.includes("readyok")) {
      ready = true;
      if (readyTimer) {
        window.clearTimeout(readyTimer);
        readyTimer = null;
      }
      if (readyResolve) {
        readyResolve();
        readyResolve = null;
      }
      return;
    }

    if (line.startsWith("info")) {
      const parsed = parseInfoLine(line);
      if (parsed && parsed.depth >= bestDepth) {
        bestDepth = parsed.depth;
        bestScore = parsed.score;
      }
      return;
    }

    if (line.startsWith("bestmove")) {
      const parts = line.split(" ");
      bestMove = parts[1];
      if (currentResolve) {
        currentResolve({
          bestMove,
          score: bestScore ?? { type: "cp", value: 0 },
        });
      }
      if (searchTimer) {
        window.clearTimeout(searchTimer);
        searchTimer = null;
      }
      currentResolve = null;
      currentReject = null;
      bestScore = null;
      bestDepth = 0;
    }
  };

  worker.onerror = () => {
    if (currentReject) {
      currentReject(new Error("Stockfish worker failed to load"));
    }
  };

  worker.onmessageerror = () => {
    if (currentReject) {
      currentReject(new Error("Stockfish message error"));
    }
  };

  worker.postMessage("uci");
  const threads = Math.max(1, Math.min(2, navigator.hardwareConcurrency ?? 2));
  worker.postMessage(`setoption name Threads value ${threads}`);
  worker.postMessage("setoption name Hash value 128");
  worker.postMessage("ucinewgame");

  const waitReady = async () => {
    if (ready) return;
    await new Promise<void>((resolve, reject) => {
      readyResolve = resolve;
      worker.postMessage("isready");
      readyTimer = window.setTimeout(() => {
        readyResolve = null;
        reject(new Error("Stockfish did not become ready"));
      }, 15000);
    });
  };

  const analyzeFen = async (fen: string, options: AnalyzeOptions) => {
    await waitReady();

    const targetDepth = options.depth ?? 12;
    const moveTime = options.movetime;
    const currentSearchId = searchId + 1;
    searchId = currentSearchId;

    // Reset per-search tracking
    bestScore = null;
    bestDepth = 0;

    return new Promise<AnalysisResult>((resolve, reject) => {
      currentResolve = resolve;
      currentReject = reject;
      worker.postMessage("stop");
      worker.postMessage(`position fen ${fen}`);
      if (typeof moveTime === "number") {
        worker.postMessage(
          `go depth ${targetDepth} movetime ${Math.max(50, Math.round(moveTime))}`,
        );
      } else {
        worker.postMessage(`go depth ${targetDepth}`);
      }
      searchTimer = window.setTimeout(
        () => {
          if (searchId === currentSearchId) {
            worker.postMessage("stop");
          }
        },
        Math.max(8000, (moveTime ?? 0) + 4000),
      );
    });
  };

  const newGame = () => {
    worker.postMessage("stop");
    worker.postMessage("ucinewgame");
    ready = false;
    worker.postMessage("isready");
  };

  const terminate = () => {
    worker.terminate();
  };

  return {
    analyzeFen,
    newGame,
    terminate,
  };
};

let sharedEngine: StockfishEngine | null = null;
let sharedUsers = 0;
let sharedTerminateTimer: number | null = null;

export const createStockfishEngine = () => {
  if (sharedTerminateTimer) {
    window.clearTimeout(sharedTerminateTimer);
    sharedTerminateTimer = null;
  }

  if (!sharedEngine) {
    sharedEngine = createEngineInstance();
  }

  sharedUsers += 1;

  return {
    analyzeFen: sharedEngine.analyzeFen,
    newGame: sharedEngine.newGame,
    terminate: () => {
      sharedUsers = Math.max(0, sharedUsers - 1);
      if (sharedUsers === 0 && sharedEngine) {
        sharedTerminateTimer = window.setTimeout(() => {
          sharedEngine?.terminate();
          sharedEngine = null;
          sharedTerminateTimer = null;
        }, 1000);
      }
    },
  };
};
