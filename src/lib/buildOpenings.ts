// Build script to parse TSV opening files into TypeScript data
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

interface OpeningEntry {
  eco: string;
  name: string;
  moves: string[];
}

// Parse PGN notation to extract moves only
function parsePgnMoves(pgn: string): string[] {
  // Remove move numbers and periods: "1. e4 e5 2. Nf3" -> "e4 e5 Nf3"
  const movesOnly = pgn
    .replace(/\d+\.\s*/g, "") // Remove "1. ", "2. ", etc.
    .replace(/\s+/g, " ") // Normalize spaces
    .trim();

  // Split by spaces to get individual moves
  return movesOnly.split(" ").filter((m) => m.length > 0);
}

// Parse a single TSV file
function parseTsvFile(filePath: string): OpeningEntry[] {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n").slice(1); // Skip header

  const entries: OpeningEntry[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;

    const parts = line.split("\t");
    if (parts.length < 3) continue;

    const eco = parts[0].trim();
    const name = parts[1].trim();
    const pgn = parts[2].trim();

    const moves = parsePgnMoves(pgn);

    entries.push({ eco, name, moves });
  }

  return entries;
}

// Main build function
function buildOpeningsDatabase() {
  const files = ["a.tsv", "b.tsv", "c.tsv", "d.tsv", "e.tsv"];
  const allOpenings: OpeningEntry[] = [];

  for (const file of files) {
    const filePath = resolve(__dirname, "openings", file);
    console.log(`Parsing ${file}...`);
    const entries = parseTsvFile(filePath);
    allOpenings.push(...entries);
    console.log(`  Found ${entries.length} openings`);
  }

  console.log(`\nTotal openings: ${allOpenings.length}`);

  // Sort by move length (longest first) for better matching
  allOpenings.sort((a, b) => b.moves.length - a.moves.length);

  // Generate TypeScript file
  const output = `// Auto-generated from TSV files - DO NOT EDIT MANUALLY
// Generated on ${new Date().toISOString()}

export interface Opening {
  eco: string;
  name: string;
  moves: string[];
}

export const openingsDatabase: Opening[] = ${JSON.stringify(allOpenings, null, 2)};
`;

  const outputPath = resolve(__dirname, "openingsData.ts");
  writeFileSync(outputPath, output, "utf-8");
  console.log(`\nWrote compiled database to: ${outputPath}`);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, "/")}`) {
  buildOpeningsDatabase();
}
