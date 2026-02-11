import { Link } from "react-router-dom";
import type { ArchiveGame } from "../types";
import { Play } from "lucide-react";
import { calculateWinRates, getMostPlayedOpeningsWithWinRate, determinePlayStyle } from "../lib/analytics";

export const Dashboard = ({ games, username = "Youssef-2099" }: { games: ArchiveGame[], username?: string }) => {
  // Calculate real stats
  const totalGames = games.length;
  const { wins } = calculateWinRates(games, username);
  const winRate = totalGames > 0 ? ((wins / totalGames) * 100).toFixed(1) : "0";
  const playStyleData = determinePlayStyle(games, username);
  const topOpenings = getMostPlayedOpeningsWithWinRate(games, username);
  
  const recentGames = games.slice(0, 5);

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
          <StatCard label="Total Games Played" value={totalGames.toString()} />
          <StatCard label="Win Rate" value={`${winRate}%`} color="text-green-400" />
          <StatCard label="Review Queue" value={games.length > 0 ? "Active" : "Empty"} />
          <StatCard label="Current Streak" value="3 W" color="text-yellow-400" /> {/* Mock */}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Recent Games List */}
          <div className="lg:col-span-2 bg-[#1a2332] rounded-xl border border-white/5 p-6 shadow-xl">
              <h2 className="text-xl font-bold mb-4 text-white">Recent Games</h2>
              <div className="space-y-3">
                  {recentGames.map((game, i) => (
                      <div key={i} className="flex items-center justify-between p-3 bg-[#111620] rounded-lg border border-white/5 hover:border-blue-500/30 transition-colors group">
                          <div>
                              <div className="font-semibold text-gray-200">
                                  vs {game.white.username === username ? game.black.username : game.white.username}
                              </div>
                              <div className="text-xs text-gray-500">
                                  {new Date(game.end_time * 1000).toLocaleDateString()} • {game.white.username === username ? "White" : "Black"}
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
                  ))}
              </div>
          </div>

          {/* Quick Analytics / Play Style */}
          <div className="bg-[#1a2332] rounded-xl border border-white/5 p-6 shadow-xl space-y-6">
              <div>
                  <h2 className="text-xl font-bold mb-2 text-white">Play Style</h2>
                  <div className="bg-[#111620] p-4 rounded-lg text-center">
                      <span className="text-4xl">{playStyleData.emoji}</span>
                      <div className="text-lg font-bold mt-2 text-purple-400">{playStyleData.style}</div>
                      <p className="text-xs text-gray-500 mt-1">{playStyleData.description}</p>
                  </div>
              </div>
              
              <div>
                  <h2 className="text-xl font-bold mb-2 text-white">Favorite Openings</h2>
                  <ul className="space-y-2 text-sm text-gray-300">
                      {topOpenings.length > 0 ? topOpenings.map((opening, i) => (
                        <li key={i} className="flex justify-between">
                          <span className="truncate mr-2">{opening.name}</span> 
                          <span className={Number(opening.winRate) >= 50 ? "text-green-400" : "text-yellow-400"}>{opening.winRate}% WR</span>
                        </li>
                      )) : (
                        <li className="text-gray-500 text-xs">No opening data found in PGN headers</li>
                      )}
                  </ul>
              </div>
          </div>
      </div>
    </div>
  );
};

const StatCard = ({ label, value, color = "text-white" }: { label: string, value: string, color?: string }) => (
    <div className="bg-[#1a2332] p-5 rounded-xl border border-white/5 flex flex-col justify-between shadow-lg hover:translate-y-[-2px] transition-transform">
        <span className="text-gray-500 text-xs uppercase tracking-wider font-semibold">{label}</span>
        <span className={`text-2xl font-bold mt-2 ${color}`}>{value}</span>
    </div>
);
