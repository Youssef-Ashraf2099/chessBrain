import React from "react";
import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, History} from "lucide-react";

export const Layout = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();

  const navItems = [
    { label: "Dashboard", path: "/", icon: LayoutDashboard },
    { label: "Replay", path: "/replay", icon: History },
   
  ];

  return (
    <div className="min-h-screen bg-[#0f1219] text-gray-100 font-sans flex text-sm">
      <aside className="w-16 lg:w-64 flex-shrink-0 border-r border-white/10 flex flex-col items-center lg:items-stretch py-6 bg-[#11141d]">
        <div className="mb-8 px-4 flex items-center justify-center lg:justify-start gap-3">
          <div className="w-8 h-8 rounded bg-blue-500/20 flex items-center justify-center text-blue-400 font-bold">
            CB
          </div>
          <span className="hidden lg:block font-bold text-lg tracking-tight text-blue-400">
            ChessBrain
          </span>
        </div>

        <nav className="flex-1 flex flex-col gap-2 px-3">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group relative
                  ${
                    isActive
                      ? "text-blue-400 bg-blue-500/10 shadow-[0_0_12px_rgba(59,130,246,0.15)]"
                      : "text-gray-400 hover:text-gray-100 hover:bg-white/5"
                  }
                `}
              >
                <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                <span className="hidden lg:block font-medium">{item.label}</span>
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-blue-500 rounded-r full lg:hidden" />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/5">
           <div className="text-xs text-gray-500 text-center lg:text-left">
             v1.2.0 beta
           </div>
        </div>
      </aside>

      <main className="flex-1 min-w-0 overflow-auto">
        <div className="max-w-7xl mx-auto p-4 lg:p-8">
            {children}
        </div>
      </main>
    </div>
  );
};
