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

Translate exactly these structural labels, and nothing else structural:
- "### Solution N: <name>"  ->  "### 解法 N：<name>"   (the technique's name stays English)
- "**Intuition**:"          ->  "**直覺**："
- "**Say it like this:**"   ->  "**面試這樣講：**"
- "<summary>Why this complexity</summary>"  ->  "<summary>為什麼是這個 complexity</summary>"
- "<summary>See the code</summary>"         ->  "<summary>看 code</summary>"
- "Variables:"              ->  "變數："

Keep every one of the following in English — never translate them:
- The TITLE line: the problem's official English name, exactly as it appears in the photo.
- "## Problem" and "## English summary", verbatim.
- Algorithm, data-structure and technique names: sliding window, monotonic stack, two
  pointers, DFS, BFS, memoization, prefix sum, binary search, backtracking, union-find,
  topological sort, heap, trie, segment tree, and so on.
- Complexity notation and its vocabulary: O(n log n), amortised O(1), time limit exceeded.
- All code and identifiers. The trailing comments inside code blocks are the exception:
  write those in Traditional Chinese, keeping any identifier or technique name English.
- Anything quoted from the photo: constraints, example input/output, function signatures,
  and variable names such as s or nums.
- Standard interview vocabulary: edge case, invariant, brute force, in-place, overflow,
  greedy, DP / dynamic programming, stack, queue, hash map.
- The whole of the "## English summary" section, which is English under every locale.

The first time you introduce an English term you may gloss it once in brackets — for
example "monotonic stack（單調堆疊）" — and then use the English alone from then on.
Do not produce a Chinese-only sentence where the key technical noun has been translated.`;
}

export interface ModeConfig {
  key: Mode;
  label: string;
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

/**
 * The interview format: the problem, then the ladder of solutions from the
 * brute force up to the optimal one, then a spoken English recap.
 *
 * Two things carry the quality here. The sentence caps stop the model padding
 * sections that are billed at the output rate. And the count is adaptive —
 * forcing a fixed number of solutions onto a problem that only has two makes
 * the model invent a third, which is worse than stopping at two.
 */
const INTERVIEW_FORMAT = (language: string) => `## Problem
Two or three lines: what is being asked, plus the constraints visible in the photo.

---

Then a ladder of solutions. Before you write any of them, work out what the OPTIMAL
solution is, then decide which earlier solutions actually lead there — do not write
forwards and hope the last one turns out to be optimal.

HOW MANY: between 2 and 4, decided by the problem, not by a quota.
- The FIRST is always the brute force, as the baseline you argue away from.
- The LAST is always the optimal solution for this problem.
- Add a middle rung only when it is a genuine stepping stone a real interview would
  walk through. If the problem goes straight from brute force to optimal, write two
  and stop. A padded rung — the same algorithm rewritten, or a variant that is not
  actually better — is worse than no rung.
- If you are not confident a solution is correct, leave it out. Two solid solutions
  beat four where one is wrong.

Each solution uses EXACTLY this shape:

### Solution N: <short name of the technique, in English>

\`Time O(...) · Space O(...)\`

**Intuition**: one or two sentences — what you would notice in the first thirty
seconds and say out loud. Name the data structure or technique it points to.

**Say it like this:**
1. <one line>
2. <one line>
3. <one line>
(3-5 steps. This is a script to speak, not prose to read. For the brute force,
the last step says why it is too slow and what idea the next solution brings.)

> **Time O(...) · Space O(...)**: one plain sentence tying each bound to what the
> algorithm actually does.
> Variables: n = <what n is>, m = <what m is>, ...

<details>
<summary>Why this complexity</summary>

Derive both bounds — count the work, do not assert the answer. Three to six lines.

</details>

<details>
<summary>See the code</summary>

\`\`\`${language}
<the code>
\`\`\`

</details>

CODE RULES
- Use the standard class/method signature for the problem.
- EVERY line gets a trailing comment saying what that line does. Align the comments
  into a column. Keep each one short — a clause, not a sentence.
- The code must run as written. No pseudocode, no elisions.

HTML RULES — get these exactly right or the page renders as literal text:
- A blank line after <summary>...</summary>, and a blank line before </details>.
- Never indent the <details> or <summary> tags.
- Never put a <details> inside another <details>.

After the last solution:

## English summary
AT MOST THREE SENTENCES, in English, always — this section is never translated. The
script for the optimal solution only: the insight, the algorithm, the complexity.
Plain spoken English, no markdown, no code, no bullet points.

NEVER claim a solution was tested, benchmarked, or verified against cases. You cannot
run code. Stating a confidence score or a number of test cases passed would be
fabricated, and a reader trusting a made-up score is worse off than one trusting
nothing.`;

export const MODES: Record<Mode, ModeConfig> = {
  // -------------------------------------------------------------- MEDIUM ----
  medium: {
    key: 'medium',
    label: 'Medium',
    budgetMs: 180_000,
    model: 'claude-sonnet-5',
    maxTokens: 12_000,
    thinking: true,
    effort: 'medium',
    color: '#a78bfa',
    accent: 'text-accent-medium',
    ring: 'ring-accent-medium/40 bg-accent-medium/10',
    systemPrompt: (language) => `${BASE_RULES}

MODE: MEDIUM. The answer the reader takes into the interview, and the one that runs on
every upload. Get the optimal solution right before you worry about the rungs below it.

${INTERVIEW_FORMAT(language)}`,
  },

  // ---------------------------------------------------------------- FINE ----
  fine: {
    key: 'fine',
    label: 'Fine',
    budgetMs: 240_000,
    model: 'claude-opus-5',
    maxTokens: 24_000,
    thinking: true,
    effort: 'high',
    color: '#fb923c',
    accent: 'text-accent-fine',
    ring: 'ring-accent-fine/40 bg-accent-fine/10',
    systemPrompt: (language) => `${BASE_RULES}

MODE: FINE. The same format as Medium, run on the strongest model with time to think.
This is what the reader presses when the Medium answer looked wrong, or when the problem
is hard enough that they want the complexity analysis checked rather than asserted.

So spend the extra time where it changes the answer: on whether the optimal solution is
actually optimal, on whether the code is correct against every constraint in the photo,
and on whether each rung of the ladder earns its place. Do not spend it on more words.

${INTERVIEW_FORMAT(language)}`,
  },
};

export const MODE_ORDER: Mode[] = ['medium', 'fine'];

/** The tab shown when a new submission arrives. */
export const DEFAULT_MODE: Mode = 'medium';

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
 * Rough cost before a pass runs, for the button that starts it. Input is ~6.4k
 * tokens whichever mode runs; output is what separates them, and the ladder of
 * solutions made output the dominant term (Fine's high effort spends most of
 * its own on thinking, which bills at the output rate).
 */
export const TYPICAL_COST: Record<Mode, number> = {
  medium: 0.058,
  fine: 0.18,
};

export function formatCost(usd: number): string {
  if (usd < 0.01) return `<$0.01`;
  return `$${usd.toFixed(usd < 1 ? 3 : 2)}`;
}
