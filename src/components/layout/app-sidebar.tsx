/*
 * Name: app-sidebar.tsx
 * Purpose: Left sidebar with grouped, collapsible navigation.
 * Description: Destinations are grouped (Home on top, then Library, Tools, and
 *   System) and each carries a line icon, so the list reads at a glance instead
 *   of as one long column. On desktop it collapses to an icon-only rail via the
 *   toggle at the bottom; the choice persists in localStorage. On mobile it is
 *   a slide-over drawer with an overlay: when closed the aside is inert, so its
 *   links leave the tab order instead of being focusable off-screen. The active
 *   item uses the accent background, and tapping a link on mobile closes the
 *   drawer.
 * Tech Stack: React 19, Tailwind CSS, React Router
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-14
 */

import { useEffect, useRef, useState } from "react";
import { NavLink } from "react-router";

import { ROUTES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { NAV_ICONS, type NavIconName } from "./nav-icons";

interface NavItem {
  path: string;
  label: string;
  icon: NavIconName;
  /** Anchor id for the product tour, when this item is a tour stop. */
  tour?: string;
}

interface NavGroup {
  label: string | null;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: null,
    items: [{ path: ROUTES.HOME, label: "Home", icon: "home", tour: "nav-home" }],
  },
  {
    label: "Library",
    items: [
      { path: ROUTES.NOTEBOOKS, label: "Notebooks", icon: "notebooks", tour: "nav-notebooks" },
      { path: ROUTES.DOCUMENTS, label: "Documents", icon: "documents", tour: "nav-documents" },
      { path: ROUTES.SEARCH, label: "Search", icon: "search", tour: "nav-search" },
      { path: ROUTES.GRAPH, label: "Connections", icon: "connections", tour: "nav-connections" },
    ],
  },
  {
    label: "Tools",
    items: [
      { path: ROUTES.CHAT, label: "Chat", icon: "chat", tour: "nav-chat" },
      { path: ROUTES.THINKING_PARTNER, label: "Think", icon: "think", tour: "nav-think" },
      { path: ROUTES.STUDIO, label: "Studio", icon: "studio", tour: "nav-studio" },
      { path: ROUTES.CANVAS, label: "Canvas", icon: "canvas", tour: "nav-canvas" },
      { path: ROUTES.TRANSFORMS, label: "Transform", icon: "transform", tour: "nav-transform" },
      { path: ROUTES.PODCASTS, label: "Audio Studio", icon: "audio", tour: "nav-audio" },
      { path: ROUTES.PROMPT_STUDIO, label: "Prompt Studio", icon: "prompt", tour: "nav-prompt" },
    ],
  },
  {
    label: "System",
    items: [
      { path: ROUTES.MODELS, label: "Models", icon: "models", tour: "nav-models" },
      { path: ROUTES.SETTINGS, label: "Settings", icon: "settings", tour: "nav-settings" },
      { path: ROUTES.HELP, label: "Help", icon: "help", tour: "nav-help" },
      { path: ROUTES.ABOUT, label: "About", icon: "about", tour: "nav-about" },
    ],
  },
];

const COLLAPSE_KEY = "notebooklab-sidebar-collapsed";

interface AppSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AppSidebar({ isOpen, onClose }: AppSidebarProps) {
  const asideRef = useRef<HTMLElement>(null);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === "true");

  const toggleCollapsed = () => {
    setCollapsed((current) => {
      const next = !current;
      localStorage.setItem(COLLAPSE_KEY, String(next));
      return next;
    });
  };

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
      data-tour="sidebar"
      className={cn(
        "flex flex-col flex-shrink-0 border-r border-border bg-bg overflow-hidden",
        "transition-all duration-200 ease-out motion-reduce:transition-none",
        "fixed md:relative z-30 h-full md:h-auto w-[220px]",
        collapsed ? "md:w-[68px]" : "md:w-[220px]",
        isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
      )}
    >
      <nav className="flex-1 overflow-y-auto p-3 space-y-5" aria-label="Primary">
        {NAV_GROUPS.map((group, groupIndex) => (
          <div key={group.label ?? "top"}>
            {group.label && (
              <SectionLabel className={collapsed ? "md:hidden" : ""}>{group.label}</SectionLabel>
            )}
            {/* In the collapsed rail the headers are hidden, so a hairline keeps
                the groups visually distinct. Skip it above the first group. */}
            {group.label && groupIndex > 0 && (
              <div className={cn("mx-2 mb-2 h-px bg-border", collapsed ? "hidden md:block" : "hidden")} />
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.path === ROUTES.HOME}
                  onClick={onClose}
                  title={item.label}
                  aria-label={item.label}
                  data-tour={item.tour}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-2.5 rounded-sm px-2 py-1.5 text-sm transition-colors",
                      collapsed ? "md:justify-center md:gap-0 md:px-0 md:py-2" : "",
                      isActive
                        ? "bg-primary text-on-primary font-semibold"
                        : "text-text-3 hover:text-text-1 hover:bg-surface-2",
                    )
                  }
                >
                  <span aria-hidden="true">{NAV_ICONS[item.icon]}</span>
                  <span className={cn("truncate", collapsed ? "md:hidden" : "")}>{item.label}</span>
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Collapse toggle: desktop only. On mobile the drawer already toggles
          from the header, and an icon-only drawer would not make sense. */}
      <button
        type="button"
        onClick={toggleCollapsed}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        aria-pressed={collapsed}
        className={cn(
          "hidden md:flex items-center gap-2.5 border-t border-border px-4 py-3",
          "font-mono text-2xs uppercase tracking-widest text-text-4 hover:text-text-2 transition-colors",
          collapsed ? "md:justify-center md:px-0" : "",
        )}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className={cn("shrink-0 transition-transform", collapsed ? "rotate-180" : "")}
        >
          <path d="M15 6l-6 6 6 6" />
        </svg>
        <span className={collapsed ? "md:hidden" : ""}>Collapse</span>
      </button>
    </aside>
  );
}

function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "block mb-1.5 font-mono text-2xs tracking-[2px] uppercase text-text-4",
        className,
      )}
    >
      {children}
    </span>
  );
}
