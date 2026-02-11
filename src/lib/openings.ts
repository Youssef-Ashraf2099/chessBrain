import { openingsDatabase } from "./openingsData";

export interface Opening {
  eco: string;
  name: string;
  moves: string[];
}

export const isBookMove = (
  movesSoFar: string[],
  moveIndex: number,
): boolean => {
  return openingsDatabase.some((opening) => {
    if (moveIndex >= opening.moves.length) {
      return false;
    }
    for (let i = 0; i <= moveIndex; i += 1) {
      if (opening.moves[i] !== movesSoFar[i]) {
        return false;
      }
    }
    return true;
  });
};

export const getOpeningName = (movesSoFar: string[]): string | null => {
  console.log("[Opening Detection] Moves provided:", movesSoFar.slice(0, 10));
  console.log("[Opening Detection] Database size:", openingsDatabase.length);

  // Find the longest matching opening
  let bestMatch: Opening | null = null;
  let bestMatchLength = 0;

  for (const opening of openingsDatabase) {
    if (opening.moves.length > movesSoFar.length) {
      continue;
    }

    let matches = true;
    for (let i = 0; i < opening.moves.length; i += 1) {
      if (opening.moves[i] !== movesSoFar[i]) {
        matches = false;
        break;
      }
    }

    if (matches && opening.moves.length > bestMatchLength) {
      bestMatch = opening;
      bestMatchLength = opening.moves.length;
    }
  }

  const result = bestMatch ? `${bestMatch.name} (${bestMatch.eco})` : null;
  console.log("[Opening Detection] Result:", result);
  
  // Fallback: Use pattern recognition if no exact match
  if (!result && movesSoFar.length >= 2) {
    const patternResult = getOpeningByPattern(movesSoFar);
    if (patternResult) {
      console.log("[Opening Detection] Pattern-based result:", patternResult);
      return patternResult;
    }
  }
  
  return result;
};

// Pattern-based opening recognition for common opening families
export const getOpeningByPattern = (moves: string[]): string | null => {
  if (moves.length < 2) return null;
  
  const first = moves[0];
  const second = moves[1];
  const third = moves[2] || "";
  
  // E4 openings
  if (first === "e4") {
    if (second === "e5") return "Open Game";
    if (second === "c5") return "Sicilian Defense";
    if (second === "e6") return "French Defense";
    if (second === "c6") return "Caro-Kann Defense";
    if (second === "d6") return "Pirc Defense";
    if (second === "Nf6") return "Alekhine Defense";
    if (second === "g6") return "Modern Defense";
    if (second === "d5") return "Scandinavian Defense";
    if (second === "Nc6") return "Nimzowitsch Defense";
    if (second === "b6") return "Owen Defense";
    return "King's Pawn Opening";
  }
  
  // D4 openings
  if (first === "d4") {
    if (second === "d5") {
      if (third === "c4") return "Queen's Gambit";
      return "Closed Game";
    }
    if (second === "Nf6") {
      if (third === "c4") return "Indian Defense";
      if (third === "Nf3") return "Indian Game";
      return "Indian Defense";
    }
    if (second === "f5") return "Dutch Defense";
    if (second === "e6") return "French Indian Defense";
    if (second === "g6") return "Modern Defense";
    if (second === "c5") return "Benoni Defense";
    if (second === "d6") return "Wade Defense";
    return "Queen's Pawn Opening";
  }
  
  // C4 openings
  if (first === "c4") {
    if (second === "e5") return "English Opening: Reversed Sicilian";
    if (second === "Nf6") return "English Opening";
    if (second === "c5") return "English Opening: Symmetrical";
    if (second === "e6") return "English Opening";
    if (second === "c6") return "English Opening";
    return "English Opening";
  }
  
  // Nf3 openings
  if (first === "Nf3") {
    if (second === "d5") return "Réti Opening";
    if (second === "Nf6") return "Réti Opening";
    if (second === "c5") return "Réti Opening";
    if (second === "g6") return "King's Indian Attack";
    return "Réti Opening";
  }
  
  // F4 openings
  if (first === "f4") {
    return "Bird Opening";
  }
  
  // G3 openings  
  if (first === "g3") {
    return "King's Fianchetto Opening";
  }
  
  // B3/B4 openings
  if (first === "b3") return "Larsen Opening";
  if (first === "b4") return "Sokolsky Opening";
  
  // Nc3 openings
  if (first === "Nc3") {
    if (second === "d5") return "Van't Kruijs Opening";
    if (second === "e5") return "Dunst Opening";
    return "Dunst Opening";
  }
  
  return null;
};
