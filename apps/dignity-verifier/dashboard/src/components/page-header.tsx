/**
 * Dignity Verifier Dashboard — Page Header
 *
 * Consistent page header with eyebrow, title, and description.
 */

interface PageHeaderProps {
  eyebrow: string;
  title: string;
  description: string;
}

export function PageHeader({ eyebrow, title, description }: PageHeaderProps) {
  return (
    <header className="mb-8">
      <p className="mb-2 text-xs font-medium uppercase tracking-widest text-emerald-400">
        {eyebrow}
      </p>
      <h1 className="text-3xl font-bold text-slate-100">{title}</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-400">{description}</p>
    </header>
  );
}
