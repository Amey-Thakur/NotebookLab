/*
 * Name: app.tsx
 * Purpose: Root application component.
 * Description: Every route maps to a fully implemented page. Home loads
 *   eagerly so the landing screen paints immediately; every other page is
 *   code-split and loads on first visit behind a brief, consistent loading
 *   mark, which keeps the initial bundle (and cold start) small even as heavy
 *   features (the Markdown editor, the canvas, the graph) grow. Routes use
 *   ROUTES constants from lib/constants.ts.
 * Tech Stack: React 19, React Router v7
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";

import { ROUTES } from "./lib/constants";
import { AppShell } from "./components/layout/app-shell";
import { PageLoader } from "./components/shared/page-loader";
import { HomePage } from "./features/home/pages/home-page";
import { useLocalModelAutostart } from "./features/model-manager/hooks/use-local-model-autostart";

/* Each page becomes its own chunk, fetched from local disk on first visit. */
const NotebooksPage = lazy(() =>
  import("./features/notebooks/pages/notebooks-page").then((m) => ({ default: m.NotebooksPage })),
);
const NotebookDetailPage = lazy(() =>
  import("./features/notebooks/pages/notebook-detail-page").then((m) => ({
    default: m.NotebookDetailPage,
  })),
);
const EditorPage = lazy(() =>
  import("./features/editor/pages/editor-page").then((m) => ({ default: m.EditorPage })),
);
const SearchPage = lazy(() =>
  import("./features/search/pages/search-page").then((m) => ({ default: m.SearchPage })),
);
const ChatPage = lazy(() =>
  import("./features/chat/pages/chat-page").then((m) => ({ default: m.ChatPage })),
);
const ThinkingPartnerPage = lazy(() =>
  import("./features/thinking-partner/pages/thinking-partner-page").then((m) => ({
    default: m.ThinkingPartnerPage,
  })),
);
const StudioPage = lazy(() =>
  import("./features/studio/pages/studio-page").then((m) => ({ default: m.StudioPage })),
);
const CanvasPage = lazy(() =>
  import("./features/canvas/pages/canvas-page").then((m) => ({ default: m.CanvasPage })),
);
const DocumentsPage = lazy(() =>
  import("./features/documents/pages/documents-page").then((m) => ({ default: m.DocumentsPage })),
);
const TransformsPage = lazy(() =>
  import("./features/content-transformations/pages/transforms-page").then((m) => ({
    default: m.TransformsPage,
  })),
);
const ModelManagerPage = lazy(() =>
  import("./features/model-manager/pages/model-manager-page").then((m) => ({
    default: m.ModelManagerPage,
  })),
);
const PodcastPage = lazy(() =>
  import("./features/podcasts/pages/podcast-page").then((m) => ({ default: m.PodcastPage })),
);
const PromptStudioPage = lazy(() =>
  import("./features/prompt-studio/pages/prompt-studio-page").then((m) => ({
    default: m.PromptStudioPage,
  })),
);
const GraphPage = lazy(() =>
  import("./features/graph/pages/graph-page").then((m) => ({ default: m.GraphPage })),
);
const SettingsPage = lazy(() =>
  import("./features/settings/pages/settings-page").then((m) => ({ default: m.SettingsPage })),
);
const HelpPage = lazy(() =>
  import("./features/help/pages/help-page").then((m) => ({ default: m.HelpPage })),
);
const AboutPage = lazy(() =>
  import("./features/about/pages/about-page").then((m) => ({ default: m.AboutPage })),
);

export function App() {
  /* Bring a downloaded local model back on launch when it is the only option,
     so offline users land on a working state without a manual Start. */
  useLocalModelAutostart();

  return (
    <AppShell>
      <Suspense fallback={<PageLoader />}>
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
          <Route path={ROUTES.HELP} element={<HelpPage />} />
          <Route path={ROUTES.ABOUT} element={<AboutPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
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
