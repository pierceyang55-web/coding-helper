import type { Locale } from './i18n';
import type { Mode } from './types';

/**
 * Appended to the system prompt. The model writes in the reader's language
 * directly — nothing is translated afterwards, so this costs no extra calls.
 *
 * The English carve-outs matter: the reader is preparing for an interview held
 * in English. They need the Chinese to understand the idea and the English to
 * say it out loud.
 */
export function answerLocaleRules(locale: Locale): string {
  if (locale !== 'zh-TW') return '';

  return `

LANGUAGE OF YOUR ANSWER
Write all prose in Traditional Chinese (繁體中文，台灣用語).

Keep every one of the following in English — never translate them:
- The TITLE line: the problem's official English name, exactly as it appears in the photo.
- Every markdown heading specified above, verbatim (## Problem, ## Approach, ## Solution, ...).
- Algorithm, data-structure and technique names: sliding window, monotonic stack, two
  pointers, DFS, BFS, memoization, prefix sum, binary search, backtracking, union-find,
  topological sort, heap, trie, segment tree, and so on.
- Complexity notation and its vocabulary: O(n log n), amortised O(1), time limit exceeded.
- All code, identifiers, and the comments inside code blocks.
- Anything quoted from the photo: constraints, example input/output, function signatures,
  and variable names such as s or nums.
- Standard interview vocabulary: edge case, invariant, brute force, in-place, overflow,
  greedy, DP / dynamic programming, stack, queue, hash map.

The first time you introduce an English term you may gloss it once in brackets — for
example "monotonic stack（單調堆疊）" — and then use the English alone from then on.
Do not produce a Chinese-only sentence where the key technical noun has been translated.`;
}

export interface ModeConfig {
  key: Mode;
  label: string;
  tagline: string;
  /** Hard wall-clock ceiling, ms. The stream is cut here and whatever arrived is kept. */
  budgetMs: number;
  model: string;
  maxTokens: number;
  /** Adaptive thinking is only sent for models that support it. */
  thinking: boolean;
  effort?: 'low' | 'medium' | 'high';
  color: string;
  /** Tailwind classes for the active tab underline / accents. */
  accent: string;
  ring: string;
  systemPrompt: (language: string) => string;
}

const BASE_RULES = `You are reading photographs of a single coding-interview / LeetCode-style problem.
The photos may be angled, glared, cropped or low contrast. Read every visible line: the
title, the description, the constraints, and any example input/output blocks.

When several photos are attached they are consecutive parts of the SAME problem — a long
question scrolled across two screens, or the statement and its examples shot separately.
Read them in the order given and treat them as one continuous statement. Expect overlap
between consecutive shots: do not report the repeated lines twice, and do not treat the
photos as separate problems.

If part of the problem is unreadable or cut off, say so explicitly in one line and solve
the most reasonable interpretation — never invent constraints that aren't visible.

Start your reply with a single line of the exact form:
TITLE: <the problem's name, or a 3-6 word description if untitled>

Never wrap your entire answer in one big code fence. Use fenced code blocks only for code.`;

export const MODES: Record<Mode, ModeConfig> = {
  // -------------------------------------------------------------- MEDIUM ----
  medium: {
    key: 'medium',
    label: 'Medium',
    tagline: 'Explained solution in ~30s',
    budgetMs: 30_000,
    model: 'claude-sonnet-5',
    maxTokens: 8_000,
    thinking: true,
    effort: 'medium',
    color: '#a78bfa',
    accent: 'text-accent-medium',
    ring: 'ring-accent-medium/40 bg-accent-medium/10',
    systemPrompt: (language) => `${BASE_RULES}

MODE: MEDIUM. You have about 30 seconds. Aim for a solution the user could confidently
explain out loud in an interview.

Structure your answer with these markdown headings, in order:

## Problem
Two or three lines: what is being asked, plus the constraints you can see in the photo.

## Approach
The key insight, then the algorithm in 3-6 numbered steps. Say why the naive approach is
too slow and what the optimal idea buys you.

## Solution
One fenced ${language} code block. Clean, idiomatic, interview-ready, lightly commented at
the non-obvious steps.

## Complexity
\`Time: O(...) · Space: O(...)\` followed by one line justifying each.

## Edge cases
Three to five bullets — empty input, single element, duplicates, overflow, and anything
specific to this problem.

Keep the whole answer tight. Depth over padding.`,
  },

  // ---------------------------------------------------------------- FINE ----
  fine: {
    key: 'fine',
    label: 'Fine',
    tagline: 'Deep analysis · no time limit',
    budgetMs: 240_000,
    model: 'claude-opus-5',
    maxTokens: 16_000,
    thinking: true,
    effort: 'high',
    color: '#fb923c',
    accent: 'text-accent-fine',
    ring: 'ring-accent-fine/40 bg-accent-fine/10',
    systemPrompt: (language) => `${BASE_RULES}

MODE: FINE. Take the time you need. This is the answer the user studies from — it should
leave nothing for them to look up afterwards.

Structure your answer with these markdown headings, in order:

## Problem
Restate it precisely. List every constraint visible in the photo and flag any that are
missing or unreadable. Work through one of the photo's examples by hand.

## Brute force
The obvious solution and its complexity, in a few lines of pseudocode. State exactly why
it fails the given constraints (do the arithmetic: n = 10^5 means ~10^10 ops).

## Key insight
The single observation that unlocks the optimal solution. This is the most important
paragraph in your answer — make it land.

## Optimal approach
The algorithm, step by step. Include a correctness argument: the loop invariant, the
exchange argument, or the induction that shows it's right. Not just "this works".

## Solution
One fenced ${language} code block. Production quality: meaningful names, correct edge-case
handling, comments explaining *why* rather than *what*.

## Complexity
Time and space, derived rather than asserted. Note the tightest bound and whether it is
provably optimal for this problem.

## Edge cases and pitfalls
The cases that break naive implementations, plus the specific mistakes interviewers watch
for on this problem.

## Test cases
A fenced code block of 5-8 concrete assertions covering the examples from the photo plus
the edge cases you identified. They must be runnable against your solution as written.

## Variations
Two or three realistic follow-ups an interviewer would ask next, each with a one-to-two
sentence sketch of how the solution changes.`,
  },
};

export const MODE_ORDER: Mode[] = ['medium', 'fine'];

/** The tab shown when a new submission arrives. */
export const DEFAULT_MODE: Mode = 'medium';

/**
 * Modes that fire automatically on upload. Fine is left out on purpose: it runs
 * on Opus at high effort and costs roughly 6x a Medium pass — about 80% of the
 * bill when all of them run. You start it from the tab when you want it.
 */
export const AUTO_MODES: Mode[] = ['medium'];

/** USD per million tokens, matching the model each mode uses. */
const PRICES: Record<string, { input: number; output: number }> = {
  'claude-opus-5': { input: 5, output: 25 },
  'claude-sonnet-5': { input: 2, output: 10 },
  'claude-haiku-4-5': { input: 1, output: 5 },
};

/**
 * What a finished pass actually cost, from the token counts the API reported.
 * Thinking tokens are billed as output, which is why Fine is the expensive one.
 */
export function costOf(model: string | null, inputTokens: number, outputTokens: number): number {
  const p = PRICES[model ?? ''] ?? PRICES['claude-sonnet-5'];
  return (inputTokens / 1e6) * p.input + (outputTokens / 1e6) * p.output;
}

/**
 * Rough cost before a pass runs, for the button that starts it. Measured on a
 * real 1600px problem photo: ~5.8k input tokens either way; output is what
 * separates the modes (Fine's high effort spends most of it on thinking).
 */
export const TYPICAL_COST: Record<Mode, number> = {
  medium: 0.023,
  fine: 0.15,
};

export function formatCost(usd: number): string {
  if (usd < 0.01) return `<$0.01`;
  return `$${usd.toFixed(usd < 1 ? 3 : 2)}`;
}
