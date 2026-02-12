import { useEffect, useState } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  useParams,
  useLocation,
} from "react-router-dom";
import { Layout } from "./components/Layout";
import { Dashboard } from "./pages/Dashboard";
import { Replayer } from "./pages/Replayer";
import type { ArchiveGame } from "./types";

const USERNAME = "Youssef-2099";
const ARCHIVES_URL = `https://api.chess.com/pub/player/${USERNAME}/games/archives`;

// Temporary API inline until we move it to src/api/games.ts
const fetchAllGames = async (): Promise<ArchiveGame[]> => {
  try {
    const archivesResponse = await fetch(ARCHIVES_URL);
    if (!archivesResponse.ok) return [];

    const archivesData = (await archivesResponse.json()) as {
      archives: string[];
    };
    if (!archivesData.archives.length) return [];

    const games = await Promise.all(
      archivesData.archives.map(async (archiveUrl) => {
        const gamesResponse = await fetch(archiveUrl);
        if (!gamesResponse.ok) return [];
        const gamesData = (await gamesResponse.json()) as {
          games: ArchiveGame[];
        };
        return gamesData.games;
      }),
    );
    return games.flat().sort((a, b) => b.end_time - a.end_time);
  } catch (e) {
    console.error(e);
    return [];
  }
};

const AppContent = () => {
  const [games, setGames] = useState<ArchiveGame[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAllGames().then((data) => {
      setGames(data);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0f1219] text-white">
        <div className="animate-pulse">Loading Chess Data...</div>
      </div>
    );
  }

  return (
    <Layout>
      <Routes>
        <Route
          path="/"
          element={<Dashboard games={games} username={USERNAME} />}
        />
        <Route
          path="/replay"
          element={<ReplayerWrapper games={games} username={USERNAME} />}
        />
        <Route
          path="/replay/:gameId"
          element={<ReplayerWrapper games={games} username={USERNAME} />}
        />
      </Routes>
    </Layout>
  );
};

// Wrapper to handle finding the game by ID or showing the latest
const ReplayerWrapper = ({
  games,
  username,
}: {
  games: ArchiveGame[];
  username: string;
}) => {
  const { gameId } = useParams<{ gameId?: string }>();
  const location = useLocation();

  // First, try to get game from location state (passed from Dashboard)
  const gameFromState = (location.state as { game?: ArchiveGame })?.game;

  // If no state, try to find game by ID in URL
  let selectedGame: ArchiveGame | null = gameFromState || null;

  if (!selectedGame && gameId) {
    // Match game by URL ending or end_time
    selectedGame =
      games.find(
        (g) => g.url.endsWith(gameId) || g.end_time.toString() === gameId,
      ) || null;
  }

  // Fall back to first game if nothing selected
  if (!selectedGame && games.length > 0) {
    selectedGame = games[0];
  }

  return <Replayer game={selectedGame} username={username} />;
};

const App = () => {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
};

export default App;
