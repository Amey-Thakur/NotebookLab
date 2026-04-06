/*
 * Title: app-sidebar.tsx
 * Tech Stack: React 19, Tailwind CSS, React Router
 * Description: Left sidebar containing notebook tree, documents, notes, and quick actions.
 * Important Details: Sidebar width is fixed at 200px for MVP. Sections use JetBrains Mono
 *   uppercase labels per the design system. Active notebook is highlighted with accent color.
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


export function AppSidebar() {
  return (
    <aside className="w-[200px] flex-shrink-0 border-r border-border bg-bg overflow-y-auto">
      <nav className="p-3">
        <SectionLabel>Navigation</SectionLabel>

        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `block px-2 py-1 text-sm rounded-sm transition-colors ${
                isActive
                  ? "bg-accent-dim text-text-1 font-semibold"
                  : "text-text-3 hover:text-text-1"
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
