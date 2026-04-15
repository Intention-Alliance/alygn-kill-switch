'use client';

// Feature Flags — Stub page (backend flags API not yet implemented)

export default function FlagsPage() {
  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-100">Feature Flags</h1>
        <p className="text-sm text-gray-500 mt-1">
          Manage feature flags for chaos experiments (ADR-116)
        </p>
      </div>

      <div className="rounded-xl border border-gray-800 bg-gray-900 p-8 text-center">
        <p className="text-gray-500">Feature flags API not yet implemented</p>
        <p className="text-gray-600 text-sm mt-2">See GitHub issues #71-84 for implementation plan</p>
      </div>
    </div>
  );
}