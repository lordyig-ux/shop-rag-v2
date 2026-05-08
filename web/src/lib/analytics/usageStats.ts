export type UsageTopSource = {
  title: string;
  sourceRef: string;
  sourceUrl: string | null;
  rank: number;
};

export type UsageQueryLog = {
  question: string;
  normalizedQuestion: string;
  resultCount: number;
  usedAi: boolean;
  warnings: string[];
  createdAt: number;
  responseTimeMs?: number;
  topSources?: UsageTopSource[];
};

export type UsageSourceClick = {
  question: string;
  chunkId: string;
  title: string;
  sourceUrl: string | null;
  sourceRank: number;
  createdAt: number;
};

export type UsageFeedbackRating = "up" | "down" | "helpful" | "not_helpful" | "missing_info" | "wrong_source";

export type UsageFeedback = {
  question: string;
  answer: string;
  rating: UsageFeedbackRating;
  comment?: string;
  topSourceTitle?: string;
  topSourceRef?: string;
  createdAt: number;
};

export type UsageAnalyticsInput = {
  queryLogs: UsageQueryLog[];
  sourceClicks: UsageSourceClick[];
  feedback: UsageFeedback[];
};

export function summarizeUsageAnalytics(input: UsageAnalyticsInput) {
  const noResultSearches = input.queryLogs.filter((log) => log.resultCount === 0).length;
  const warningSearchesWithResults = input.queryLogs.filter((log) => log.resultCount > 0 && log.warnings.length > 0).length;
  const reviewFeedbackCount = input.feedback.filter((item) => isReviewFeedback(item.rating)).length;
  const responseTimes = input.queryLogs.map((log) => log.responseTimeMs).filter((value): value is number => typeof value === "number");
  const reviewQuestionSet = new Set<string>();

  for (const log of input.queryLogs) {
    if (log.resultCount === 0 || log.warnings.length > 0) {
      reviewQuestionSet.add(log.question);
    }
  }

  for (const item of input.feedback) {
    if (isReviewFeedback(item.rating)) {
      reviewQuestionSet.add(item.question);
    }
  }

  return {
    totals: {
      searches: input.queryLogs.length,
      sourceClicks: input.sourceClicks.length,
      helpful: input.feedback.filter((item) => item.rating === "helpful" || item.rating === "up").length,
      needsReview: noResultSearches + warningSearchesWithResults + reviewFeedbackCount,
      noResultSearches,
      averageResponseTimeMs: responseTimes.length ? Math.round(responseTimes.reduce((sum, value) => sum + value, 0) / responseTimes.length) : 0,
    },
    topSearches: topCounts(input.queryLogs.map((log) => log.question), 8).map(({ key, count }) => ({ question: key, count })),
    mostClickedSources: topSourceClicks(input.sourceClicks, 8),
    reviewCandidates: Array.from(reviewQuestionSet)
      .map((question) => ({ question }))
      .sort((left, right) => left.question.localeCompare(right.question))
      .slice(0, 8),
  };
}

function topCounts(values: string[], limit: number) {
  const counts = new Map<string, number>();
  for (const value of values) {
    const key = value.trim();
    if (!key) {
      continue;
    }
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key))
    .slice(0, limit);
}

function topSourceClicks(clicks: UsageSourceClick[], limit: number) {
  const sourceMap = new Map<string, { title: string; sourceUrl: string | null; clicks: number }>();
  for (const click of clicks) {
    const key = click.sourceUrl || click.title;
    const current = sourceMap.get(key) || { title: click.title, sourceUrl: click.sourceUrl, clicks: 0 };
    current.clicks += 1;
    sourceMap.set(key, current);
  }

  return Array.from(sourceMap.values())
    .sort((left, right) => right.clicks - left.clicks || left.title.localeCompare(right.title))
    .slice(0, limit);
}

function isReviewFeedback(rating: UsageFeedbackRating) {
  return rating === "down" || rating === "not_helpful" || rating === "missing_info" || rating === "wrong_source";
}
