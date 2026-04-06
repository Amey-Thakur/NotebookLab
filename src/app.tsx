/*
 * Title: app.tsx
 * Tech Stack: React 19, React Router v7
 * Description: Root application component. Renders the app shell layout and routes.
 * Important Details: Only Thinking Partner and Podcasts remain as placeholders.
 *   All other routes have real page implementations.
 */

import { Routes, Route, Navigate } from "react-router-dom";

import { ROUTES } from "./lib/constants";
import { AppShell } from "./components/layout/app-shell";
import { NotebooksPage } from "./features/notebooks/pages/notebooks-page";
import { NotebookDetailPage } from "./features/notebooks/pages/notebook-detail-page";
import { EditorPage } from "./features/editor/pages/editor-page";
import { SearchPage } from "./features/search/pages/search-page";
import { ChatPage } from "./features/chat/pages/chat-page";
import { ThinkingPartnerPage } from "./features/thinking-partner/pages/thinking-partner-page";
import { ModelManagerPage } from "./features/model-manager/pages/model-manager-page";
import { SettingsPage } from "./features/settings/pages/settings-page";


export function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Navigate to={ROUTES.NOTEBOOKS} replace />} />
        <Route path={ROUTES.NOTEBOOKS} element={<NotebooksPage />} />
        <Route path={ROUTES.NOTEBOOK_DETAIL} element={<NotebookDetailPage />} />
        <Route path={ROUTES.EDITOR} element={<EditorPage />} />
        <Route path={ROUTES.SEARCH} element={<SearchPage />} />
        <Route path={ROUTES.CHAT} element={<ChatPage />} />
        <Route path={ROUTES.THINKING_PARTNER} element={<ThinkingPartnerPage />} />
        <Route path={ROUTES.PODCASTS} element={<PlaceholderPage title="Podcasts" />} />
        <Route path={ROUTES.MODELS} element={<ModelManagerPage />} />
        <Route path={ROUTES.SETTINGS} element={<SettingsPage />} />
        <Route path="*" element={<PlaceholderPage title="Page not found" />} />
      </Routes>
    </AppShell>
  );
}


function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-center h-full text-text-3">
      <p className="text-lg font-medium">{title}</p>
    </div>
  );
}
