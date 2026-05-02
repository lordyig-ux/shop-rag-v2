import Link from "next/link";

export default function UnauthorizedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 text-slate-950">
      <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-amber-700">Access restricted</p>
        <h1 className="mt-2 text-2xl font-semibold">Company email required</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Admin access is limited to signed-in users with a terminalauto.ca or valleycollision.ca email address.
        </p>
        <Link
          className="mt-5 inline-flex rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          href="/"
        >
          Back to search
        </Link>
      </section>
    </main>
  );
}
