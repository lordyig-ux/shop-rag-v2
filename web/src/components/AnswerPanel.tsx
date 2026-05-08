import type { SearchResponse } from "@/lib/search/contracts";
import type { Citation } from "@/lib/search/contracts";
import type { UsageFeedbackRating } from "@/lib/analytics/usageStats";

export function AnswerPanel({
  feedbackState = "idle",
  onFeedback,
  onSourceClick,
  response,
}: {
  feedbackState?: "idle" | "sending" | "sent";
  onFeedback?: (rating: UsageFeedbackRating) => void;
  onSourceClick?: (citation: Citation, index: number) => void;
  response: SearchResponse;
}) {
  return (
    <section className="space-y-5" aria-live="polite">
      {response.warnings.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {response.warnings.map((warning) => (
            <span
              key={warning}
              className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-900"
            >
              {warning}
            </span>
          ))}
        </div>
      ) : null}

      <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-950">Answer</h2>
          <span className="text-xs font-medium text-slate-500">
            {response.usedAi ? "Source-backed answer" : "Source excerpts"} - {response.resultCount} source
            {response.resultCount === 1 ? "" : "s"}
          </span>
        </div>
        <p className="whitespace-pre-wrap text-sm leading-6 text-slate-800">{response.answer}</p>
        <div className="mt-4 border-t border-slate-100 pt-4">
          {feedbackState === "sent" ? (
            <p className="text-sm font-medium text-slate-600">Thanks, your feedback was recorded.</p>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-slate-700">Was this helpful?</span>
              {feedbackOptions.map((option) => (
                <button
                  key={option.rating}
                  className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:border-[var(--brand-red)] disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={feedbackState === "sending" || !onFeedback}
                  type="button"
                  onClick={() => onFeedback?.(option.rating)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </article>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-slate-950">Sources</h2>
        {response.citations.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">
            No matching public-safe sources were found.
          </p>
        ) : (
          response.citations.map((citation, index) => {
            const href = citation.sourceUrlWithPage || citation.sourceUrl;
            const pageLabel = citation.pageRange || citation.pageNumber;
            return (
              <article
                key={`${citation.chunkId}-${index}`}
                className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-950">
                      [{index + 1}] {citation.title}
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">
                      {citation.category} - {citation.knowledgeType.replace("_", " ")}
                    </p>
                  </div>
                  {href ? (
                    <a
                      className="text-sm font-medium text-[var(--brand-red)] underline-offset-4 hover:underline"
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => onSourceClick?.(citation, index)}
                    >
                      {pageLabel ? `Open page ${pageLabel}` : "Open source"}
                    </a>
                  ) : (
                    <span className="text-xs text-slate-500">{citation.sourceRef}</span>
                  )}
                </div>
                <p className="mt-3 whitespace-pre-wrap rounded border border-slate-100 bg-slate-50 p-3 text-sm leading-6 text-slate-700">
                  {citation.excerpt}
                </p>
              </article>
            );
          })
        )}
      </section>
    </section>
  );
}

const feedbackOptions: Array<{ label: string; rating: UsageFeedbackRating }> = [
  { label: "Helpful", rating: "helpful" },
  { label: "Not helpful", rating: "not_helpful" },
  { label: "Missing info", rating: "missing_info" },
  { label: "Wrong source", rating: "wrong_source" },
];
