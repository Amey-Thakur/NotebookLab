/*
 * Name: app.tsx
 * Purpose: Root application component.
 * Description: Every route maps to a fully implemented page, including
 *   Podcasts (Web Speech playback). Routes use ROUTES constants
 *   from lib/constants.ts.
 * Tech Stack: React 19, React Router v7
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

import { Routes, Route } from "react-router-dom";

import { ROUTES } from "./lib/constants";
import { AppShell } from "./components/layout/app-shell";
import { HomePage } from "./features/home/pages/home-page";
import { NotebooksPage } from "./features/notebooks/pages/notebooks-page";
import { NotebookDetailPage } from "./features/notebooks/pages/notebook-detail-page";
import { EditorPage } from "./features/editor/pages/editor-page";
import { SearchPage } from "./features/search/pages/search-page";
import { ChatPage } from "./features/chat/pages/chat-page";
import { ThinkingPartnerPage } from "./features/thinking-partner/pages/thinking-partner-page";
import { StudioPage } from "./features/studio/pages/studio-page";
import { CanvasPage } from "./features/canvas/pages/canvas-page";
import { DocumentsPage } from "./features/documents/pages/documents-page";
import { TransformsPage } from "./features/content-transformations/pages/transforms-page";
import { ModelManagerPage } from "./features/model-manager/pages/model-manager-page";
import { PodcastPage } from "./features/podcasts/pages/podcast-page";
import { PromptStudioPage } from "./features/prompt-studio/pages/prompt-studio-page";
import { GraphPage } from "./features/graph/pages/graph-page";
import { SettingsPage } from "./features/settings/pages/settings-page";
import { AboutPage } from "./features/about/pages/about-page";


export function App() {
  return (
    <AppShell>
      <Routes>
        <Route path={ROUTES.HOME} element={<HomePage />} />
        <Route path={ROUTES.NOTEBOOKS} element={<NotebooksPage />} />
        <Route path={ROUTES.NOTEBOOK_DETAIL} element={<NotebookDetailPage />} />
        <Route path={ROUTES.EDITOR} element={<EditorPage />} />
        <Route path={ROUTES.SEARCH} element={<SearchPage />} />
        <Route path={ROUTES.DOCUMENTS} element={<DocumentsPage />} />
        <Route path={ROUTES.CHAT} element={<ChatPage />} />
        <Route path={ROUTES.THINKING_PARTNER} element={<ThinkingPartnerPage />} />
        <Route path={ROUTES.STUDIO} element={<StudioPage />} />
        <Route path={ROUTES.CANVAS} element={<CanvasPage />} />
        <Route path={ROUTES.TRANSFORMS} element={<TransformsPage />} />
        <Route path={ROUTES.PODCASTS} element={<PodcastPage />} />
        <Route path={ROUTES.PROMPT_STUDIO} element={<PromptStudioPage />} />
        <Route path={ROUTES.GRAPH} element={<GraphPage />} />
        <Route path={ROUTES.MODELS} element={<ModelManagerPage />} />
        <Route path={ROUTES.SETTINGS} element={<SettingsPage />} />
        <Route path={ROUTES.ABOUT} element={<AboutPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AppShell>
  );
}


function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-text-3 p-8">
      <h1 className="text-lg font-display font-bold mb-2">Page not found</h1>
      <p className="text-sm text-text-4">This page does not exist. Use the sidebar to navigate.</p>
    </div>
  );
}
