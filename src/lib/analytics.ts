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
  // This is a placeholder as full PGN parsing for every game to get openings might be heavy.
  // Ideally, if the API provided opening info we would use that.
  // For now, checks if the PGN string contains "Opening" tag or just rely on what we can parse.
  // A robust implementation would need to parse PGN headers.
  
  const openings: Record<string, { name: string; count: number; wins: number }> = {};

  // Simple regex to extract Opening tag from PGN if available
  const openingRegex = /\[Opening "(.+?)"\]/;

  games.forEach(game => {
     const match = game.pgn.match(openingRegex);
     if (match && match[1]) {
         const openingName = match[1].split(":")[0]; // Simplify "Sicilian Defense: Najdorf" to "Sicilian Defense" for broader grouping? Or keep unique.
         // Let's keep full name for now but maybe trim some variants if too distinct.
         
         if (!openings[openingName]) {
             openings[openingName] = { name: openingName, count: 0, wins: 0 };
         }
         openings[openingName].count++;
         
         // Check win
         // We need username inside this function or passed in. Assuming we have 'games' and can infer or pass username.
         // For simplicity, let's assume we can pass username or just count generic stats.
         // Actually, let's extract result logic.
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
