/*
 * Title: app.tsx
 * Tech Stack: React 19, React Router v7
 * Description: Root application component. Renders the app shell layout and routes.
 * Important Details: All routes are lazy-loaded for code splitting. The app shell
 *   (sidebar + header + content area) persists across navigation.
 */

import { Routes, Route, Navigate } from "react-router-dom";

import { AppShell } from "./components/layout/app-shell";


export function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Navigate to="/notebooks" replace />} />
        <Route path="/notebooks" element={<PlaceholderPage title="Notebooks" />} />
        <Route path="/notebooks/:id" element={<PlaceholderPage title="Notebook Detail" />} />
        <Route path="/editor/:id" element={<PlaceholderPage title="Editor" />} />
        <Route path="/search" element={<PlaceholderPage title="Search" />} />
        <Route path="/chat" element={<PlaceholderPage title="Chat" />} />
        <Route path="/thinking-partner" element={<PlaceholderPage title="Thinking Partner" />} />
        <Route path="/podcasts" element={<PlaceholderPage title="Podcasts" />} />
        <Route path="/models" element={<PlaceholderPage title="Model Manager" />} />
        <Route path="/settings" element={<PlaceholderPage title="Settings" />} />
      </Routes>
    </AppShell>
  );
}


/* Temporary placeholder until real pages are implemented */
function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-center h-full text-text-3">
      <p className="text-lg font-medium">{title}</p>
    </div>
  );
}
