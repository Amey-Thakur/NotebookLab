/*
 * Title: app-shell.tsx
 * Tech Stack: React 19, Tailwind CSS
 * Description: Main application chrome. Renders sidebar, header, and content area.
 * Important Details: Sidebar collapses on mobile (<768px) behind a hamburger toggle.
 *   Content area has max-width for readability on wide screens.
 */

import { useState, type ReactNode } from "react";

import { AppSidebar } from "./app-sidebar";
import { AppHeader } from "./app-header";
import { StatusBar } from "./status-bar";


interface AppShellProps {
  children: ReactNode;
}


export function AppShell({ children }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex flex-col h-screen bg-bg text-text-1 overflow-hidden">
      <AppHeader onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />

      <div className="flex flex-1 overflow-hidden relative">
        {/* Mobile overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/40 z-20 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <AppSidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        <main className="flex-1 overflow-auto bg-surface" aria-label="Content">
          <div className="max-w-5xl mx-auto">
            {children}
          </div>
        </main>
      </div>

      <StatusBar />
    </div>
  );
}
