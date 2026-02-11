export type ArchiveGame = {
  pgn: string;
  end_time: number;
  url: string;
  white: { username: string; result: string };
  black: { username: string; result: string };
};

export type MoveInfo = {
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

export type EvalScore = {
  type: "cp" | "mate";
  value: number;
};

export type Classification =
  | "book"
  | "best"
  | "brilliant"
  | "great"
  | "excellent"
  | "inaccuracy"
  | "mistake"
  | "blunder";

export type AnalyzedMove = MoveInfo & {
  bestMove: string;
  bestScore: EvalScore;
  afterScore: EvalScore;
  cpLoss: number;
  classification: Classification;
};
