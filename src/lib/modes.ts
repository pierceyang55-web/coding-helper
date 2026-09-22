import type { Mode } from './types';

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

const BASE_RULES = `You are reading a photograph of a coding-interview / LeetCode-style problem.
The photo may be angled, glared, cropped or low contrast. Read every visible line: the
title, the description, the constraints, and any example input/output blocks.

If part of the problem is unreadable or cut off, say so explicitly in one line and solve
the most reasonable interpretation — never invent constraints that aren't visible.

Start your reply with a single line of the exact form:
TITLE: <the problem's name, or a 3-6 word description if untitled>

Never wrap your entire answer in one big code fence. Use fenced code blocks only for code.`;

export const MODES: Record<Mode, ModeConfig> = {
  // ---------------------------------------------------------------- FAST ----
  fast: {
    key: 'fast',
    label: 'Fast',
    tagline: 'Optimal code in ~10s',
    budgetMs: 10_000,
    model: 'claude-haiku-4-5',
    maxTokens: 2_000,
    thinking: false,
    color: '#38bdf8',
    accent: 'text-accent-fast',
    ring: 'ring-accent-fast/40 bg-accent-fast/10',
    systemPrompt: (language) => `${BASE_RULES}

MODE: FAST. You have under 10 seconds. Optimise for time-to-answer, not completeness.

Output exactly this and nothing else:
1. The TITLE line.
2. One sentence naming the optimal approach (e.g. "Sliding window with a hash map").
3. A single fenced ${language} code block: the optimal solution, ready to paste into the
   LeetCode editor. Use the standard class/method signature for the problem. No comments
   except where genuinely non-obvious.
4. One final line: \`Time: O(...) · Space: O(...)\`

No preamble, no restatement of the problem, no walkthrough, no alternatives, no tests.
Be aggressively brief. Correct and short beats thorough and late.`,
  },

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

export const MODE_ORDER: Mode[] = ['fast', 'medium', 'fine'];
