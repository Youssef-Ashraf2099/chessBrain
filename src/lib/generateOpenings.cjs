const fs = require('fs');
const path = require('path');

// Parse PGN notation to extract moves only
function parsePgnMoves(pgn) {
  const movesOnly = pgn
    .replace(/\d+\.\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return movesOnly.split(' ').filter(m => m.length > 0);
}

// Parse a single TSV file
function parseTsvFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').slice(1);
  
  const entries = [];
  
  for (const line of lines) {
    if (!line.trim()) continue;
    
    const parts = line.split('\t');
    if (parts.length < 3) continue;
    
    const eco = parts[0].trim();
    const name = parts[1].trim();
    const pgn = parts[2].trim();
    
    const moves = parsePgnMoves(pgn);
    
    // Only include openings with reasonable depth (4-15 moves)
    if (moves.length >= 4 && moves.length <= 15) {
      entries.push({ eco, name, moves });
    }
  }
  
  return entries;
}

// Main build function
function buildOpeningsDatabase() {
  const files = ['a.tsv', 'b.tsv', 'c.tsv', 'd.tsv', 'e.tsv'];
  const allOpenings = [];
  
  for (const file of files) {
    const filePath = path.join(__dirname, 'openings', file);
    console.log(`Parsing ${file}...`);
    const entries = parseTsvFile(filePath);
    allOpenings.push(...entries);
    console.log(`  Found ${entries.length} openings`);
  }
  
  console.log(`\nTotal openings: ${allOpenings.length}`);
  
  // Sort by move length (longest first) for better matching
  allOpenings.sort((a, b) => b.moves.length - a.moves.length);
  
  // Generate TypeScript file
  const output = `// Auto-generated from ECO TSV files
// Total openings: ${allOpenings.length}
// Generated: ${new Date().toISOString()}

export interface Opening {
  eco: string;
  name: string;
  moves: string[];
}

export const openingsDatabase: Opening[] = ${JSON.stringify(allOpenings, null, 2)};
`;
  
  const outputPath = path.join(__dirname, 'openingsData.ts');
  fs.writeFileSync(outputPath, output, 'utf-8');
  console.log(`\nGenerated: ${outputPath}`);
}

buildOpeningsDatabase();
