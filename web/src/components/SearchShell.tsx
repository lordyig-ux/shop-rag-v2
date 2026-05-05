"use client";

import { useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useState } from "react";

import { convexFunctions } from "@/lib/convexReferences";
import type { SearchResponse } from "@/lib/search/contracts";
import { shapeSearchResponse } from "@/lib/search/shapeResults";
import { AnswerPanel } from "./AnswerPanel";

const examples = [
  "What is our SOP for aluminum repair?",
  "What does the insurance policy say about pre-repair scans?",
  "What should staff check before releasing a vehicle?",
];

export function SearchShell() {
  const [question, setQuestion] = useState("");
  const [submittedQuestion, setSubmittedQuestion] = useState("");
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [error, setError] = useState("");
  const logQuery = useMutation(convexFunctions.logQuery);

  const queryArgs = useMemo(
    () =>
      submittedQuestion
        ? {
            question: submittedQuestion,
            knowledgeType: "all" as const,
            limit: 16,
          }
        : "skip",
    [submittedQuestion],
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
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-[var(--brand-black)] sm:px-6 lg:px-8">
      <section className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(380px,1.05fr)]">
        <aside className="space-y-6 lg:sticky lg:top-6 lg:self-start">
          <header>
            <p className="text-sm font-black uppercase tracking-wide text-[var(--brand-red)]">Terminal Auto Body</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-normal sm:text-4xl">Knowledge Base</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">
              Public-safe proof of concept for searching company knowledge, SOPs, and insurance-policy material.
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
              className="mt-2 min-h-28 w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-3 text-base leading-6 outline-none transition focus:border-[var(--brand-red)] focus:ring-2 focus:ring-red-100"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  submit();
                }
              }}
              placeholder="Ask about an SOP, policy, estimate process, or shop workflow"
            />

            <button
              className="mt-4 w-full rounded-md bg-[var(--brand-black)] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[var(--brand-red)] disabled:cursor-not-allowed disabled:bg-slate-400"
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
                className="rounded-md border border-slate-200 bg-white px-3 py-2 text-left text-xs font-medium text-slate-600 shadow-sm hover:border-[var(--brand-red)] hover:text-[var(--brand-black)]"
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
