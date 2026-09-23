/**
 * Dignity Verifier Dashboard — Doc Table
 *
 * Consistent table styling for documentation pages, matching the dashboard
 * table aesthetic (slate-800 header, slate-900 rows, divide lines).
 */

import type { ReactNode } from "react";

interface DocTableProps {
  headers: readonly string[];
  rows: readonly (readonly ReactNode[])[];
}

export function DocTable({ headers, rows }: DocTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-800">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-800/60 text-xs uppercase tracking-wider text-slate-400">
          <tr>
            {headers.map((header) => (
              <th key={header} className="px-4 py-3">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800 bg-slate-900">
          {rows.map((row, index) => (
            <tr key={index} className="align-top transition hover:bg-slate-800/40">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="px-4 py-3 text-slate-300">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
