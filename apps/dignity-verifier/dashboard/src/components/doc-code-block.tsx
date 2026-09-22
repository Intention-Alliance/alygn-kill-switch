/**
 * Dignity Verifier Dashboard — Doc Code Block
 *
 * Dark code block (slate-900) with emerald syntax hints for documentation
 * pages. Renders a monospace pre with an optional language label.
 */

interface DocCodeBlockProps {
  code: string;
  label?: string;
}

export function DocCodeBlock({ code, label }: DocCodeBlockProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-900">
      {label ? (
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950/60 px-4 py-2">
          <span className="font-mono text-xs text-emerald-400">{label}</span>
        </div>
      ) : null}
      <pre className="overflow-x-auto p-4 font-mono text-xs leading-relaxed text-slate-300">
        <code>{code}</code>
      </pre>
    </div>
  );
}
