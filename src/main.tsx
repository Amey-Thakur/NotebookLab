/*
 * Title: main.tsx
 * Tech Stack: React 19, TanStack Query, React Router, Zustand
 * Description: Application entry point. Assembles the provider tree and mounts the router.
 * Important Details: Provider order matters. QueryClient wraps everything for async data.
 *   Theme provider persists the choice to localStorage; index.html applies it
 *   before first paint to avoid a theme flash.
 */

import React from "react";
import ReactDOM from "react-dom/client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";

import { ErrorBoundary } from "./components/shared/error-boundary";
import { ThemeProvider } from "./components/providers/theme-provider";
import { App } from "./app";

import "./styles/globals.css";


const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      /* Tauri IPC calls are local, so stale time can be generous */
      staleTime: 1000 * 60 * 5,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});


const root = document.getElementById("root");
if (!root) throw new Error("Root element #root not found in index.html");

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <ThemeProvider>
            <App />
          </ThemeProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
