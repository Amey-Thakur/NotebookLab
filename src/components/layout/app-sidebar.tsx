/*
 * Title: app-sidebar.tsx
 * Tech Stack: React 19, Tailwind CSS, React Router
 * Description: Left sidebar with navigation. Collapses on mobile (<768px) behind
 *   a hamburger toggle. Shows as slide-over on mobile with overlay backdrop.
 * Important Details: Nav items have hover states for better interactivity feedback.
 *   Active item uses accent background. Clicking a nav link on mobile auto-closes sidebar.
 */

import { NavLink } from "react-router-dom";

import { ROUTES } from "@/lib/constants";


const NAV_ITEMS = [
  { path: ROUTES.NOTEBOOKS, label: "Notebooks" },
  { path: ROUTES.SEARCH, label: "Search" },
  { path: ROUTES.CHAT, label: "Chat" },
  { path: ROUTES.THINKING_PARTNER, label: "Think" },
  { path: ROUTES.TRANSFORMS, label: "Transform" },
  { path: ROUTES.PODCASTS, label: "Podcasts" },
  { path: ROUTES.MODELS, label: "Models" },
  { path: ROUTES.SETTINGS, label: "Settings" },
] as const;


interface AppSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}


export function AppSidebar({ isOpen, onClose }: AppSidebarProps) {
  return (
    <aside
      className={`
        w-[200px] flex-shrink-0 border-r border-border bg-bg overflow-y-auto
        transition-transform duration-200 ease-out
        fixed md:relative z-30 h-full md:h-auto
        ${isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
      `}
    >
      <nav className="p-3">
        <SectionLabel>Navigation</SectionLabel>

        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            onClick={onClose}
            className={({ isActive }) =>
              `block px-2 py-1.5 text-sm rounded-sm transition-colors ${
                isActive
                  ? "bg-accent-dim text-text-1 font-semibold"
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
    <span className="block mb-1.5 font-mono text-[8px] tracking-[2px] uppercase text-text-4">
      {children}
    </span>
  );
}
