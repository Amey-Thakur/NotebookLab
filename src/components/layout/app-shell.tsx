/*
 * Title: app-shell.tsx
 * Tech Stack: React 19, Tailwind CSS, Zustand
 * Description: Main application chrome. Renders sidebar, header, and content area.
 * Important Details: The sidebar width is resizable via drag handle. The content area
 *   fills remaining space. This component persists across all route transitions.
 */

import type { ReactNode } from "react";

import { AppSidebar } from "./app-sidebar";
import { AppHeader } from "./app-header";
import { StatusBar } from "./status-bar";


interface AppShellProps {
  children: ReactNode;
}


export function AppShell({ children }: AppShellProps) {
  return (
    <div className="flex flex-col h-screen bg-bg text-text-1 overflow-hidden">
      <AppHeader />

      <div className="flex flex-1 overflow-hidden">
        <AppSidebar />

        <main className="flex-1 overflow-auto bg-surface" aria-label="Content">
          {children}
        </main>
      </div>

      <StatusBar />
    </div>
  );
}
