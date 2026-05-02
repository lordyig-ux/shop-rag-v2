export function SetupShell() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950 sm:px-6 lg:px-8">
      <section className="mx-auto flex max-w-5xl flex-col gap-8">
        <header>
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Terminal Auto Body</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-normal sm:text-4xl">Knowledge Base</h1>
        </header>
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Convex is not configured</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Add `NEXT_PUBLIC_CONVEX_URL` after creating the Convex deployment, then import public-safe
            chunks to enable live search.
          </p>
          <pre className="mt-4 overflow-x-auto rounded border border-slate-200 bg-slate-950 p-4 text-xs text-slate-50">
            npm run import:chunks -- --file ../output/chunks.jsonl --batch public-safe-v1 --dry-run
          </pre>
        </div>
      </section>
    </main>
  );
}
