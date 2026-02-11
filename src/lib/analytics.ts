import type { ArchiveGame } from "../types";

export type PlayStyle = "Aggressive" | "Solid" | "Dynamic" | "Unknown";

export const calculateWinRates = (games: ArchiveGame[], username: string) => {
  let wins = 0;
  let losses = 0;
  let draws = 0;

  games.forEach((game) => {
    const isWhite = game.white.username.toLowerCase() === username.toLowerCase();
    const result = isWhite ? game.white.result : game.black.result;
    
    const winResults = ["win"];
    const drawResults = [
      "agreed",
      "repetition",
      "stalemate",
      "insufficient",
      "50move",
      "timevsinsufficient",
    ];

    if (winResults.includes(result)) {
      wins++;
    } else if (drawResults.includes(result)) {
      draws++;
    } else {
      losses++;
    }
  });

  const total = wins + losses + draws;
  return { wins, losses, draws, total };
};

export const getMostPlayedOpenings = (games: ArchiveGame[]) => {
  const openings: Record<string, { name: string; count: number; wins: number }> = {};
  const openingRegex = /\[Opening "(.+?)"\]/;

  games.forEach(game => {
     const match = game.pgn.match(openingRegex);
     if (match && match[1]) {
         const openingName = match[1].split(":")[0];
         
         if (!openings[openingName]) {
             openings[openingName] = { name: openingName, count: 0, wins: 0 };
         }
         openings[openingName].count++;
     }
  });
  
  return Object.values(openings).sort((a,b) => b.count - a.count).slice(0, 5);
};

export const getMostPlayedOpeningsWithWinRate = (games: ArchiveGame[], username: string) => {
  const openings: Record<string, { name: string; count: number; wins: number }> = {};
  const openingRegex = /\[Opening "(.+?)"\]/;

  games.forEach(game => {
     const match = game.pgn.match(openingRegex);
     if (match && match[1]) {
         const openingName = match[1];
         const isWhite = game.white.username.toLowerCase() === username.toLowerCase();
         const result = isWhite ? game.white.result : game.black.result;
         
         if (!openings[openingName]) {
             openings[openingName] = { name: openingName, count: 0, wins: 0 };
         }
         openings[openingName].count++;
         if (result === "win") openings[openingName].wins++;
     }
  });
  
  return Object.values(openings)
    .sort((a,b) => b.count - a.count)
    .slice(0, 5)
    .map(o => ({ ...o, winRate: o.count > 0 ? (o.wins / o.count * 100).toFixed(1) : "0" }));
};

export const determinePlayStyle = (games: ArchiveGame[], username: string): { style: PlayStyle; emoji: string; description: string } => {
  if (games.length === 0) return { style: "Unknown", emoji: "❓", description: "Not enough data to determine play style" };
  
  const { wins, draws } = calculateWinRates(games, username);
  const avgGameLength = games.reduce((sum, g) => sum + g.pgn.split(" ").length, 0) / games.length;
  const drawRate = draws / games.length;
  const winRate = wins / games.length;
  
  // Analyze patterns
  const isAggressive = winRate > 0.55 && drawRate < 0.15;
  const isSolid = drawRate > 0.25 || (winRate > 0.48 && avgGameLength > 200);
  
  if (isAggressive) {
    return {
      style: "Aggressive",
      emoji: "⚔️",
      description: "You tend to play sharp lines and look for decisive results early."
    };
  } else if (isSolid) {
    return {
      style: "Solid",
      emoji: "🛡️",
      description: "You prefer positional play with a solid foundation and fewer risks."
    };
  } else {
    return {
      style: "Dynamic",
      emoji: "⚡",
      description: "You balance between tactical sharpness and positional understanding."
    };
  }
};

// Game Phase Analysis
export const analyzeGamePhases = (games: ArchiveGame[], username: string) => {
  let openingMistakes = 0;
  let middlegameMistakes = 0;
  let endgameMistakes = 0;
  let totalGames = 0;
  
  games.forEach(game => {
    const moveCount = game.pgn.split(/\d+\./).length - 1; // Rough move count
    totalGames++;
    
    const isWhite = game.white.username.toLowerCase() === username.toLowerCase();
    const result = isWhite ? game.white.result : game.black.result;
    
    // Simple heuristic: losses in short games = opening issues
    if (result !== "win") {
      if (moveCount < 20) openingMistakes++;
      else if (moveCount < 40) middlegameMistakes++;
      else endgameMistakes++;
    }
  });
  
  return {
    opening: { mistakes: openingMistakes, percentage: (openingMistakes / totalGames * 100).toFixed(1) },
    middlegame: { mistakes: middlegameMistakes, percentage: (middlegameMistakes / totalGames * 100).toFixed(1) },
    endgame: { mistakes: endgameMistakes, percentage: (endgameMistakes / totalGames * 100).toFixed(1) },
    weakestPhase: openingMistakes > middlegameMistakes && openingMistakes > endgameMistakes ? "Opening" :
                  middlegameMistakes > endgameMistakes ? "Middlegame" : "Endgame"
  };
};

// Color performance statistics
export const getColorStats = (games: ArchiveGame[], username: string) => {
  let whiteWins = 0, whiteLosses = 0, whiteDraws = 0;
  let blackWins = 0, blackLosses = 0, blackDraws = 0;
  
  games.forEach(game => {
    const isWhite = game.white.username.toLowerCase() === username.toLowerCase();
    const result = isWhite ? game.white.result : game.black.result;
    
    if (isWhite) {
      if (result === "win") whiteWins++;
      else if (["agreed", "repetition", "stalemate", "insufficient", "50move"].includes(result)) whiteDraws++;
      else whiteLosses++;
    } else {
      if (result === "win") blackWins++;
      else if (["agreed", "repetition", "stalemate", "insufficient", "50move"].includes(result)) blackDraws++;
      else blackLosses++;
    }
  });
  
  const whiteTotal = whiteWins + whiteLosses + whiteDraws;
  const blackTotal = blackWins + blackLosses + blackDraws;
  
  return {
    white: {
      wins: whiteWins,
      losses: whiteLosses,
      draws: whiteDraws,
      total: whiteTotal,
      winRate: whiteTotal > 0 ? (whiteWins / whiteTotal * 100).toFixed(1) : "0"
    },
    black: {
      wins: blackWins,
      losses: blackLosses,
      draws: blackDraws,
      total: blackTotal,
      winRate: blackTotal > 0 ? (blackWins / blackTotal * 100).toFixed(1) : "0"
    },
    preferredColor: whiteTotal > blackTotal ? "White" : "Black"
  };
};

// Time control performance
export const getTimeControlStats = (games: ArchiveGame[], username: string) => {
  const timeControls: Record<string, { wins: number; total: number }> = {};
  
  games.forEach(game => {
    // Extract time control from PGN
    const timeControlMatch = game.pgn.match(/\[TimeControl "(.+?)"\]/);
    let timeClass = "unknown";
    
    if (timeControlMatch && timeControlMatch[1]) {
      const tc = timeControlMatch[1];
      const baseTime = parseInt(tc.split("+")[0]) || 0;
      if (baseTime < 180) timeClass = "bullet";
      else if (baseTime < 600) timeClass = "blitz";
      else timeClass = "rapid";
    }
    
    const isWhite = game.white.username.toLowerCase() === username.toLowerCase();
    const result = isWhite ? game.white.result : game.black.result;
    
    if (!timeControls[timeClass]) {
      timeControls[timeClass] = { wins: 0, total: 0 };
    }
    
    timeControls[timeClass].total++;
    if (result === "win") timeControls[timeClass].wins++;
  });
  
  return Object.entries(timeControls).map(([name, stats]) => ({
    name,
    total: stats.total,
    wins: stats.wins,
    winRate: (stats.wins / stats.total * 100).toFixed(1)
  })).sort((a, b) => b.total - a.total);
};

// Recent form (last N games)
export const getRecentForm = (games: ArchiveGame[], username: string, lastN = 10) => {
  const recent = games.slice(0, Math.min(lastN, games.length));
  const results = recent.map(game => {
    const isWhite = game.white.username.toLowerCase() === username.toLowerCase();
    const result = isWhite ? game.white.result : game.black.result;
    
    if (result === "win") return "W";
    if (["agreed", "repetition", "stalemate", "insufficient", "50move"].includes(result)) return "D";
    return "L";
  });
  
  const wins = results.filter(r => r === "W").length;
  const streak = calculateStreak(results);
  
  return {
    results,
    recentWinRate: (wins / results.length * 100).toFixed(1),
    currentStreak: streak
  };
};

const calculateStreak = (results: string[]): string => {
  if (results.length === 0) return "0";
  
  const first = results[0];
  let count = 0;
  
  for (const result of results) {
    if (result === first) count++;
    else break;
  }
  
  return `${count} ${first}`;
};
