/*
 * Title: app.tsx
 * Tech Stack: React 19, React Router v7
 * Description: Root application component. All routes have real page implementations
 *   except Podcasts (deferred pending TTS engine decision).
 * Important Details: Routes use ROUTES constants from lib/constants.ts.
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
import { DocumentsPage } from "./features/documents/pages/documents-page";
import { TransformsPage } from "./features/content-transformations/pages/transforms-page";
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
        <Route path={ROUTES.DOCUMENTS} element={<DocumentsPage />} />
        <Route path={ROUTES.CHAT} element={<ChatPage />} />
        <Route path={ROUTES.THINKING_PARTNER} element={<ThinkingPartnerPage />} />
        <Route path={ROUTES.TRANSFORMS} element={<TransformsPage />} />
        <Route path={ROUTES.PODCASTS} element={<ComingSoonPage feature="Podcasts" />} />
        <Route path={ROUTES.MODELS} element={<ModelManagerPage />} />
        <Route path={ROUTES.SETTINGS} element={<SettingsPage />} />
        <Route path="*" element={<ComingSoonPage feature="Page not found" />} />
      </Routes>
    </AppShell>
  );
}


function ComingSoonPage({ feature }: { feature: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-text-3 p-8">
      <p className="text-lg font-display font-bold mb-2">{feature}</p>
      <p className="text-sm text-text-4">Coming soon. This feature is in development.</p>
    </div>
  );
}
