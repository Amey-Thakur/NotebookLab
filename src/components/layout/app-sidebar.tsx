/*
 * Name: app-sidebar.tsx
 * Purpose: Left sidebar with navigation.
 * Description: Collapses on mobile (<768px) behind a hamburger toggle. Shows
 *   as slide-over on mobile with overlay backdrop. When closed on
 *   mobile the aside is inert, so its links leave the tab order
 *   instead of being focusable while invisible off-screen. Active
 *   item uses accent background. Clicking a nav link on mobile
 *   auto-closes the sidebar.
 * Tech Stack: React 19, Tailwind CSS, React Router
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

import { useEffect, useRef } from "react";
import { NavLink } from "react-router-dom";

import { ROUTES } from "@/lib/constants";


const NAV_ITEMS = [
  { path: ROUTES.HOME, label: "Home" },
  { path: ROUTES.NOTEBOOKS, label: "Notebooks" },
  { path: ROUTES.DOCUMENTS, label: "Documents" },
  { path: ROUTES.SEARCH, label: "Search" },
  { path: ROUTES.CHAT, label: "Chat" },
  { path: ROUTES.THINKING_PARTNER, label: "Think" },
  { path: ROUTES.STUDIO, label: "Studio" },
  { path: ROUTES.TRANSFORMS, label: "Transform" },
  { path: ROUTES.PODCASTS, label: "Podcasts" },
  { path: ROUTES.PROMPT_STUDIO, label: "Prompt Studio" },
  { path: ROUTES.GRAPH, label: "Connections" },
  { path: ROUTES.MODELS, label: "Models" },
  { path: ROUTES.SETTINGS, label: "Settings" },
  { path: ROUTES.ABOUT, label: "About" },
] as const;


interface AppSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}


export function AppSidebar({ isOpen, onClose }: AppSidebarProps) {
  const asideRef = useRef<HTMLElement>(null);

  /* On mobile the closed drawer is only translated off-screen; make it inert
     so keyboard focus and screen readers skip it. Desktop (md+) always shows
     the sidebar, where the media query check keeps it interactive. */
  useEffect(() => {
    const aside = asideRef.current;
    if (!aside) return;

    const applyInert = () => {
      const isDesktop = window.matchMedia("(min-width: 768px)").matches;
      aside.inert = !isOpen && !isDesktop;
    };

    applyInert();
    const media = window.matchMedia("(min-width: 768px)");
    media.addEventListener("change", applyInert);
    return () => media.removeEventListener("change", applyInert);
  }, [isOpen]);

  return (
    <aside
      ref={asideRef}
      id="app-sidebar"
      className={`
        w-[200px] flex-shrink-0 border-r border-border bg-bg overflow-y-auto
        transition-transform duration-200 ease-out motion-reduce:transition-none
        fixed md:relative z-30 h-full md:h-auto
        ${isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
      `}
    >
      <nav className="p-3" aria-label="Primary">
        <SectionLabel>Navigation</SectionLabel>

        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === ROUTES.HOME}
            onClick={onClose}
            className={({ isActive }) =>
              `block px-2 py-1.5 text-sm rounded-sm transition-colors ${
                isActive
                  ? "bg-primary text-on-primary font-semibold"
                  : "text-text-3 hover:text-text-1 hover:bg-surface-2"
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}


function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="block mb-1.5 font-mono text-2xs tracking-[2px] uppercase text-text-4">
      {children}
    </span>
  );
}
