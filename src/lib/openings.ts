export const openingLines: string[][] = [
  ["e4", "e5", "Nf3", "Nc6", "Bb5"],
  ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5"],
  ["e4", "c5", "Nf3", "d6", "d4", "cxd4"],
  ["d4", "d5", "c4", "e6", "Nc3", "Nf6"],
  ["d4", "Nf6", "c4", "g6", "Nc3", "Bg7"],
  ["c4", "e5", "Nc3", "Nf6", "g3"],
  ["d4", "d5", "Nf3", "Nf6", "e3", "e6"],
  ["e4", "e5", "Nf3", "Nc6", "d4"],
];

export const isBookMove = (movesSoFar: string[], moveIndex: number) => {
  return openingLines.some((line) => {
    if (moveIndex >= line.length) {
      return false;
    }
    for (let i = 0; i <= moveIndex; i += 1) {
      if (line[i] !== movesSoFar[i]) {
        return false;
      }
    }
    return true;
  });
};
