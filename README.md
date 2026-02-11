# Chess Replay

A Chess.com-style game review for Youssef-2099 with live polling, Stockfish analysis, and offline-friendly PWA support.

## Features

- Fetches the most recent game from Chess.com and auto-polls every 60 seconds.
- Stockfish depth 14 analysis per move with classification tags.
- React chessboard styled with the Chess.com palette.
- PWA install support with offline caching for assets and API data.

## Getting Started

1. Install dependencies:
   - `npm install`
2. Start the dev server:
   - `npm run dev`
3. Build for production:
   - `npm run build`

## Notes

- The sound files in `public/sounds` are placeholders. Replace them with real Chess.com-style mp3 files.
- The icons in `public/icons` are placeholders. Replace them with your final 192x192 and 512x512 app icons.
