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
  terminate: () => void;
};

const parseScore = (line: string): EvalScore | null => {
  const cpMatch = line.match(/score cp (-?\d+)/);
  if (cpMatch) {
    return { type: "cp", value: Number(cpMatch[1]) };
  }

  const mateMatch = line.match(/score mate (-?\d+)/);
  if (mateMatch) {
    return { type: "mate", value: Number(mateMatch[1]) };
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
  let readyTimer: number | null = null;
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
      return;
    }

    if (line.startsWith("info")) {
      const score = parseScore(line);
      if (score) {
        bestScore = score;
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
    if (ready) {
      return;
    }
    await new Promise<void>((resolve, reject) => {
      const interval = window.setInterval(() => {
        if (ready) {
          window.clearInterval(interval);
          resolve();
        }
      }, 30);
      readyTimer = window.setTimeout(() => {
        window.clearInterval(interval);
        reject(new Error("Stockfish did not become ready"));
      }, 8000);
    });
  };

  const analyzeFen = async (fen: string, options: AnalyzeOptions) => {
    await waitReady();

    const targetDepth = options.depth ?? 12;
    const moveTime = options.movetime;
    const currentSearchId = searchId + 1;
    searchId = currentSearchId;

    return new Promise<AnalysisResult>((resolve, reject) => {
      currentResolve = resolve;
      currentReject = reject;
      worker.postMessage("stop");
      worker.postMessage("ucinewgame");
      worker.postMessage(`position fen ${fen}`);
      if (typeof moveTime === "number") {
        worker.postMessage(`go movetime ${Math.max(50, Math.round(moveTime))}`);
      } else {
        worker.postMessage(`go depth ${targetDepth}`);
      }
      searchTimer = window.setTimeout(
        () => {
          if (searchId === currentSearchId) {
            reject(new Error("Stockfish analysis timed out"));
          }
        },
        Math.max(5000, (moveTime ?? 0) + 3000),
      );
    });
  };

  const terminate = () => {
    worker.terminate();
  };

  return {
    analyzeFen,
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
