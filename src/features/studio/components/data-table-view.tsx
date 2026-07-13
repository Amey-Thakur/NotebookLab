/*
 * Name: data-table-view.tsx
 * Purpose: Render a generated data table.
 * Description: Draws the columns and rows as a real table that scrolls
 *   horizontally when wide. Cells are read by column index, so a row with the
 *   wrong number of cells still lines up. Falls back to a plain message when
 *   the model returns nothing usable.
 * Tech Stack: React 19, Tailwind CSS
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-13
 */

import type { DataTable } from "../api/studio-api";

export function DataTableView({ data }: { data: DataTable }) {
  const columns = data.columns ?? [];
  const rows = data.rows ?? [];
  if (columns.length === 0 || rows.length === 0) {
    return <p className="text-sm text-text-3">The table came back empty. Try a broader focus.</p>;
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h2 className="mb-4 font-display text-lg font-bold text-text-1">{data.title}</h2>
      <div className="overflow-x-auto border border-border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-surface-2">
              {columns.map((col, i) => (
                <th
                  key={i}
                  className="border-b border-border px-3 py-2 text-left font-display font-semibold text-text-1"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r} className="odd:bg-surface even:bg-bg">
                {columns.map((_, c) => (
                  <td
                    key={c}
                    className="border-b border-border px-3 py-2 align-top font-body text-text-2"
                  >
                    {row[c] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
