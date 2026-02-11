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
  return result;
};
