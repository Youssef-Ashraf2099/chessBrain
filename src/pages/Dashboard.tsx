import { Link } from "react-router-dom";
import { useState } from "react";
import type { ArchiveGame } from "../types";
import { Play, Search, TrendingUp, Trophy, Target } from "lucide-react";
import { 
  calculateWinRates, 
  getMostPlayedOpeningsWithWinRate, 
  determinePlayStyle,
  analyzeGamePhases,
  getColorStats,
  getTimeControlStats,
  getRecentForm
} from "../lib/analytics";

export const Dashboard = ({ games, username = "Youssef-2099" }: { games: ArchiveGame[], username?: string }) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const gamesPerPage = 20;

  // Calculate real stats
  const totalGames = games.length;
  const winRateData = calculateWinRates(games, username);
  const winRate = totalGames > 0 ? ((winRateData.wins / totalGames) * 100).toFixed(1) : "0";
  const playStyleData = determinePlayStyle(games, username);
  const topOpenings = getMostPlayedOpeningsWithWinRate(games, username);
  const gamePhases = analyzeGamePhases(games, username);
  const colorStats = getColorStats(games, username);
  const timeControlStats = getTimeControlStats(games, username);
  const recentForm = getRecentForm(games, username, 10);

  // Filter and paginate games
  const filteredGames = games.filter(game => {
    if (!searchTerm) return true;
    const opponent = game.white.username === username ? game.black.username : game.white.username;
    return opponent.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const totalPages = Math.ceil(filteredGames.length / gamesPerPage);
  const startIndex = (currentPage - 1) * gamesPerPage;
  const paginatedGames = filteredGames.slice(startIndex, startIndex + gamesPerPage);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header>
         <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
             Dashboard
         </h1>
         <p className="text-gray-400 mt-2">Welcome back, {username}. Here is your chess summary.</p>
      </header>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total Games" value={totalGames.toString()} icon={<Trophy size={20} />} />
          <StatCard label="Win Rate" value={`${winRate}%`} color="text-green-400" icon={<TrendingUp size={20} />} />
          <StatCard label="Current Streak" value={recentForm.currentStreak} color="text-yellow-400" icon={<Target size={20} />} />
          <StatCard label="Weakest Phase" value={gamePhases.weakestPhase} color="text-orange-400" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Game List - Full Width on Left */}
          <div className="lg:col-span-2 space-y-4">
              {/* Search Bar */}
              <div className="bg-[#1a2332] rounded-xl border border-white/5 p-4 shadow-xl">
                  <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" size={18} />
                      <input 
                          type="text"
                          placeholder="Search by opponent..."
                          value={searchTerm}
                          onChange={(e) => {
                              setSearchTerm(e.target.value);
                              setCurrentPage(1);
                          }}
                          className="w-full pl-10 pr-4 py-2 bg-[#111620] border border-white/5 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50"
                      />
                  </div>
              </div>

              {/* Game List */}
              <div className="bg-[#1a2332] rounded-xl border border-white/5 p-6 shadow-xl">
                  <h2 className="text-xl font-bold mb-4 text-white">All Games ({filteredGames.length})</h2>
                  <div className="space-y-2">
                      {paginatedGames.map((game, i) => {
                          const isWhite = game.white.username === username;
                          const opponent = isWhite ? game.black.username : game.white.username;
                          const result = isWhite ? game.white.result : game.black.result;
                          
                          let resultBadge = "";
                          let badgeColor = "";
                          if (result === "win") {
                              resultBadge = "W";
                              badgeColor = "bg-green-500/20 text-green-400";
                          } else if (["agreed", "repetition", "stalemate", "insufficient", "50move"].includes(result)) {
                              resultBadge = "D";
                              badgeColor = "bg-gray-500/20 text-gray-400";
                          } else {
                              resultBadge = "L";
                              badgeColor = "bg-red-500/20 text-red-400";
                          }

                          return (
                              <div key={i} className="flex items-center justify-between p-3 bg-[#111620] rounded-lg border border-white/5 hover:border-blue-500/30 transition-colors group">
                                  <div className="flex items-center gap-3 flex-1">
                                      <span className={`w-8 h-8 flex items-center justify-center rounded-full font-bold text-sm ${badgeColor}`}>
                                          {resultBadge}
                                      </span>
                                      <div className="flex-1">
                                          <div className="font-semibold text-gray-200">
                                              vs {opponent}
                                          </div>
                                          <div className="text-xs text-gray-500">
                                              {new Date(game.end_time * 1000).toLocaleDateString()} • {isWhite ? "White" : "Black"}
                                          </div>
                                      </div>
                                  </div>
                                  <Link 
                                     to={`/replay/${game.url.split('/').pop()}`}
                                     state={{ game }}
                                     className="opacity-0 group-hover:opacity-100 transition-opacity p-2 bg-blue-500/20 text-blue-400 rounded-full hover:bg-blue-500 hover:text-white"
                                  >
                                      <Play size={16} fill="currentColor" />
                                  </Link>
                              </div>
                          );
                      })}
                  </div>

                  {/* Pagination */}
                  {totalPages > 1 && (
                      <div className="flex justify-center gap-2 mt-6">
                          <button
                              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                              disabled={currentPage === 1}
                              className="px-4 py-2 bg-[#111620] text-white rounded-lg disabled:opacity-30 hover:bg-blue-500/20 transition-colors"
                          >
                              Previous
                          </button>
                          <span className="px-4 py-2 text-gray-400">
                              Page {currentPage} of {totalPages}
                          </span>
                          <button
                              onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                              disabled={currentPage === totalPages}
                              className="px-4 py-2 bg-[#111620] text-white rounded-lg disabled:opacity-30 hover:bg-blue-500/20 transition-colors"
                          >
                              Next
                          </button>
                      </div>
                  )}
              </div>
          </div>

          {/* Analytics Sidebar */}
          <div className="space-y-4">
              {/* Play Style */}
              <div className="bg-[#1a2332] rounded-xl border border-white/5 p-6 shadow-xl">
                  <h2 className="text-xl font-bold mb-2 text-white">Play Style</h2>
                  <div className="bg-[#111620] p-4 rounded-lg text-center">
                      <span className="text-4xl">{playStyleData.emoji}</span>
                      <div className="text-lg font-bold mt-2 text-purple-400">{playStyleData.style}</div>
                      <p className="text-xs text-gray-500 mt-1">{playStyleData.description}</p>
                  </div>
              </div>

              {/* Color Performance */}
              <div className="bg-[#1a2332] rounded-xl border border-white/5 p-6 shadow-xl">
                  <h2 className="text-xl font-bold mb-3 text-white">Color Stats</h2>
                  <div className="space-y-3">
                      <div className="bg-[#111620] p-3 rounded-lg">
                          <div className="flex justify-between items-center">
                              <span className="text-gray-300">⚪ White</span>
                              <span className="text-green-400 font-bold">{colorStats.white.winRate}%</span>
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                              {colorStats.white.wins}W-{colorStats.white.losses}L-{colorStats.white.draws}D
                          </div>
                      </div>
                      <div className="bg-[#111620] p-3 rounded-lg">
                          <div className="flex justify-between items-center">
                              <span className="text-gray-300">⚫ Black</span>
                              <span className="text-green-400 font-bold">{colorStats.black.winRate}%</span>
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                              {colorStats.black.wins}W-{colorStats.black.losses}L-{colorStats.black.draws}D
                          </div>
                      </div>
                  </div>
              </div>

              {/* Game Phases */}
              <div className="bg-[#1a2332] rounded-xl border border-white/5 p-6 shadow-xl">
                  <h2 className="text-xl font-bold mb-3 text-white">Game Phase Analysis</h2>
                  <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                          <span className="text-gray-400">Opening</span>
                          <span className="text-orange-400">{gamePhases.opening.percentage}% issues</span>
                      </div>
                      <div className="flex justify-between">
                          <span className="text-gray-400">Middlegame</span>
                          <span className="text-orange-400">{gamePhases.middlegame.percentage}% issues</span>
                      </div>
                      <div className="flex justify-between">
                          <span className="text-gray-400">Endgame</span>
                          <span className="text-orange-400">{gamePhases.endgame.percentage}% issues</span>
                      </div>
                  </div>
              </div>

              {/* Time Controls */}
              <div className="bg-[#1a2332] rounded-xl border border-white/5 p-6 shadow-xl">
                  <h2 className="text-xl font-bold mb-3 text-white">Time Controls</h2>
                  <div className="space-y-2 text-sm">
                      {timeControlStats.map((tc, i) => (
                          <div key={i} className="flex justify-between">
                              <span className="text-gray-400 capitalize">{tc.name}</span>
                              <span className="text-green-400">{tc.winRate}% ({tc.total})</span>
                          </div>
                      ))}
                  </div>
              </div>

              {/* Favorite Openings */}
              <div className="bg-[#1a2332] rounded-xl border border-white/5 p-6 shadow-xl">
                  <h2 className="text-xl font-bold mb-3 text-white">Top Openings</h2>
                  <ul className="space-y-2 text-sm text-gray-300">
                      {topOpenings.length > 0 ? topOpenings.map((opening, i) => (
                        <li key={i} className="flex justify-between">
                          <span className="truncate mr-2">{opening.name}</span> 
                          <span className={Number(opening.winRate) >= 50 ? "text-green-400" : "text-yellow-400"}>{opening.winRate}%</span>
                        </li>
                      )) : (
                        <li className="text-gray-500 text-xs">No opening data found</li>
                      )}
                  </ul>
              </div>
          </div>
      </div>
    </div>
  );
};

const StatCard = ({ label, value, color = "text-white", icon }: { label: string, value: string, color?: string, icon?: React.ReactNode }) => (
    <div className="bg-[#1a2332] p-5 rounded-xl border border-white/5 flex flex-col justify-between shadow-lg hover:translate-y-[-2px] transition-transform">
        <div className="flex items-center justify-between">
            <span className="text-gray-500 text-xs uppercase tracking-wider font-semibold">{label}</span>
            {icon && <span className="text-gray-500">{icon}</span>}
        </div>
        <span className={`text-2xl font-bold mt-2 ${color}`}>{value}</span>
    </div>
);
