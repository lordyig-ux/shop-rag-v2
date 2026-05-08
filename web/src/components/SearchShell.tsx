"use client";

import { useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useRef, useState } from "react";

import { convexFunctions } from "@/lib/convexReferences";
import type { UsageFeedbackRating, UsageTopSource } from "@/lib/analytics/usageStats";
import type { Citation, SearchResponse } from "@/lib/search/contracts";
import { shapeSearchResponse } from "@/lib/search/shapeResults";
import { AnswerPanel } from "./AnswerPanel";

const examples = [
  "When does the structural aluminum repair rate apply?",
  "Determine if an ICBC review is required?",
  "ICBC's animal-impact policy?",
];

export function SearchShell() {
  const [question, setQuestion] = useState("");
  const [submittedQuestion, setSubmittedQuestion] = useState("");
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [error, setError] = useState("");
  const [feedbackState, setFeedbackState] = useState<"idle" | "sending" | "sent">("idle");
  const searchStartedAtRef = useRef(0);
  const sessionIdRef = useRef("");
  const logQuery = useMutation(convexFunctions.logQuery);
  const logSourceClick = useMutation(convexFunctions.logSourceClick);
  const recordFeedback = useMutation(convexFunctions.recordFeedback);

  useEffect(() => {
    sessionIdRef.current = getOrCreateSearchSessionId();
  }, []);

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
        const topSources = topSourcesFromCitations(nextResponse.citations);
        const logArgs: {
          question: string;
          resultCount: number;
          usedAi: boolean;
          warnings: string[];
          sessionId?: string;
          responseTimeMs?: number;
          topSources?: UsageTopSource[];
        } = {
          question: submittedQuestion,
          resultCount: nextResponse.resultCount,
          usedAi: nextResponse.usedAi,
          warnings: nextResponse.warnings,
        };
        if (sessionIdRef.current) {
          logArgs.sessionId = sessionIdRef.current;
        }
        if (searchStartedAtRef.current) {
          logArgs.responseTimeMs = Date.now() - searchStartedAtRef.current;
        }
        if (topSources.length) {
          logArgs.topSources = topSources;
        }
        void logQuery(logArgs);
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
    setFeedbackState("idle");
    searchStartedAtRef.current = Date.now();
  }

  function handleSourceClick(citation: Citation, index: number) {
    const clickArgs: {
      question: string;
      chunkId: string;
      title: string;
      sourceUrl: string | null;
      sourceRank: number;
      sessionId?: string;
    } = {
      question: response?.question || submittedQuestion || question,
      chunkId: citation.chunkId,
      title: citation.title,
      sourceUrl: citation.sourceUrlWithPage || citation.sourceUrl,
      sourceRank: index + 1,
    };
    if (sessionIdRef.current) {
      clickArgs.sessionId = sessionIdRef.current;
    }
    void logSourceClick(clickArgs);
  }

  async function handleFeedback(rating: UsageFeedbackRating) {
    if (!response || feedbackState === "sending") {
      return;
    }

    setFeedbackState("sending");
    const topSource = response.citations[0];
    const feedbackArgs: {
      question: string;
      answer: string;
      rating: UsageFeedbackRating;
      sessionId?: string;
      topSourceTitle?: string;
      topSourceRef?: string;
    } = {
      question: response.question,
      answer: response.answer,
      rating,
    };
    if (sessionIdRef.current) {
      feedbackArgs.sessionId = sessionIdRef.current;
    }
    if (topSource) {
      feedbackArgs.topSourceTitle = topSource.title;
      feedbackArgs.topSourceRef = topSource.sourceRef;
    }

    try {
      await recordFeedback(feedbackArgs);
      setFeedbackState("sent");
    } catch {
      setFeedbackState("idle");
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-[var(--brand-black)] sm:px-6 lg:px-8">
      <section className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(380px,1.05fr)]">
        <aside className="space-y-6 lg:sticky lg:top-6 lg:self-start">
          <header>
            <p className="text-sm font-black uppercase tracking-wide text-[var(--brand-red)]">Terminal Auto Body</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-normal sm:text-4xl">Knowledge Base</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">
              Search Terminal Auto Body procedures, insurance rules, and shop reference documents.
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
          {response ? (
            <AnswerPanel
              feedbackState={feedbackState}
              response={response}
              onFeedback={handleFeedback}
              onSourceClick={handleSourceClick}
            />
          ) : null}
        </section>
      </section>
    </main>
  );
}

function getOrCreateSearchSessionId() {
  if (typeof window === "undefined") {
    return "";
  }

  const storageKey = "terminal-kb-usage-session";
  const existing = window.sessionStorage.getItem(storageKey);
  if (existing) {
    return existing;
  }

  const next = window.crypto?.randomUUID?.() || `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  window.sessionStorage.setItem(storageKey, next);
  return next;
}

function topSourcesFromCitations(citations: Citation[]): UsageTopSource[] {
  return citations.slice(0, 8).map((citation, index) => ({
    title: citation.title,
    sourceRef: citation.sourceRef,
    sourceUrl: citation.sourceUrlWithPage || citation.sourceUrl,
    rank: index + 1,
  }));
}
