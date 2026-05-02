"use client";

import { useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useState } from "react";

import { convexFunctions } from "@/lib/convexReferences";
import type { KnowledgeFilter, SearchResponse } from "@/lib/search/contracts";
import { shapeSearchResponse } from "@/lib/search/shapeResults";
import { AnswerPanel } from "./AnswerPanel";

const filters: Array<{ label: string; value: KnowledgeFilter }> = [
  { label: "All docs", value: "all" },
  { label: "SOPs", value: "sop" },
  { label: "Insurance policy", value: "insurance_policy" },
  { label: "Shop docs", value: "shop_doc" },
];

const examples = [
  "What is our SOP for aluminum repair?",
  "What does the insurance policy say about pre-repair scans?",
  "What should staff check before releasing a vehicle?",
];

export function SearchShell() {
  const [question, setQuestion] = useState("");
  const [submittedQuestion, setSubmittedQuestion] = useState("");
  const [knowledgeType, setKnowledgeType] = useState<KnowledgeFilter>("all");
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [error, setError] = useState("");
  const logQuery = useMutation(convexFunctions.logQuery);

  const queryArgs = useMemo(
    () =>
      submittedQuestion
        ? {
            question: submittedQuestion,
            knowledgeType,
            limit: 8,
          }
        : "skip",
    [knowledgeType, submittedQuestion],
  );
  const chunks = useQuery(convexFunctions.search, queryArgs);
  const isSearching = Boolean(submittedQuestion && chunks === undefined);
  const isWaitingForAnswer = Boolean(submittedQuestion && !response && !error);

  useEffect(() => {
    if (!submittedQuestion || chunks === undefined) {
      return;
    }

    let active = true;

    fetch("/api/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: submittedQuestion, chunks }),
    })
      .then(async (result) => {
        if (!result.ok) {
          throw new Error(`${result.status} ${result.statusText}`);
        }
        return (await result.json()) as SearchResponse;
      })
      .catch(() =>
        shapeSearchResponse({
          question: submittedQuestion,
          chunks,
          usedAi: false,
          warnings: ["answer_route_unavailable"],
        }),
      )
      .then((nextResponse) => {
        if (!active) {
          return;
        }
        setResponse(nextResponse);
        void logQuery({
          question: submittedQuestion,
          resultCount: nextResponse.resultCount,
          usedAi: nextResponse.usedAi,
          warnings: nextResponse.warnings,
        });
      })
        .catch((err: unknown) => {
          if (active) {
            setError(err instanceof Error ? err.message : "Search failed");
          }
        });

    return () => {
      active = false;
    };
  }, [chunks, logQuery, submittedQuestion]);

  function submit(nextQuestion = question) {
    const trimmed = nextQuestion.trim();
    if (!trimmed) {
      return;
    }
    setQuestion(trimmed);
    setSubmittedQuestion(trimmed);
    setResponse(null);
    setError("");
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
      <section className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(380px,1.05fr)]">
        <aside className="space-y-6 lg:sticky lg:top-6 lg:self-start">
          <header>
            <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Terminal Auto Body</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-normal sm:text-4xl">Knowledge Base</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">
              Public-safe proof of concept for searching SOP and insurance-policy material.
            </p>
          </header>

          <form
            className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <label className="text-sm font-medium text-slate-700" htmlFor="question">
              Search the knowledge base
            </label>
            <textarea
              id="question"
              className="mt-2 min-h-28 w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-3 text-base leading-6 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Ask about an SOP, policy, estimate process, or shop workflow"
            />

            <div className="mt-4 flex flex-wrap gap-2" aria-label="Source filter">
              {filters.map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  className={`rounded-md border px-3 py-2 text-sm font-medium transition ${
                    knowledgeType === filter.value
                      ? "border-emerald-700 bg-emerald-700 text-white"
                      : "border-slate-300 bg-white text-slate-700 hover:border-emerald-600"
                  }`}
                  onClick={() => setKnowledgeType(filter.value)}
                >
                  {filter.label}
                </button>
              ))}
            </div>

            <button
              className="mt-4 w-full rounded-md bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
              type="submit"
              disabled={!question.trim() || isWaitingForAnswer}
            >
              {isWaitingForAnswer || isSearching ? "Searching..." : "Search"}
            </button>
          </form>

          <div className="flex flex-wrap gap-2">
            {examples.map((example) => (
              <button
                key={example}
                className="rounded-md border border-slate-200 bg-white px-3 py-2 text-left text-xs font-medium text-slate-600 shadow-sm hover:border-emerald-500 hover:text-slate-950"
                type="button"
                onClick={() => submit(example)}
              >
                {example}
              </button>
            ))}
          </div>
        </aside>

        <section className="min-h-[360px]">
          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>
          ) : null}
          {!response && !error ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm leading-6 text-slate-500">
              {submittedQuestion ? "Searching indexed public-safe sources..." : "Search results will appear here."}
            </div>
          ) : null}
          {response ? <AnswerPanel response={response} /> : null}
        </section>
      </section>
    </main>
  );
}
