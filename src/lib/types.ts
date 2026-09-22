export type Mode = 'medium' | 'fine';

export type ResultStatus = 'queued' | 'streaming' | 'done' | 'timeout' | 'error';

/** A submission carries 1-N photos of the same problem. */
export const MAX_IMAGES = 6;

export interface Submission {
  id: string;
  user_id: string;
  /** The first photo. Kept for rows written before multi-image support. */
  image_path: string;
  /** Every photo, in order. Null on legacy rows — read via `imagePathsOf`. */
  image_paths: string[] | null;
  /** The programming language to answer in. */
  language: string;
  /** The human language of the explanation, fixed at upload so re-runs match. */
  answer_locale: string;
  title: string | null;
  device_label: string | null;
  created_at: string;
}

export interface Result {
  id: string;
  submission_id: string;
  user_id: string;
  mode: Mode;
  status: ResultStatus;
  content: string;
  error: string | null;
  model: string | null;
  input_tokens: number | null;
  /** Includes thinking tokens — they are billed at the output rate. */
  output_tokens: number | null;
  elapsed_ms: number | null;
  started_at: string | null;
  updated_at: string;
}

/**
 * Every photo on a submission, oldest schema included. Rows created before the
 * multi-image migration only have `image_path`.
 */
export function imagePathsOf(s: Pick<Submission, 'image_path' | 'image_paths'>): string[] {
  const many = s.image_paths;
  if (many && many.length) return many;
  return s.image_path ? [s.image_path] : [];
}

export const LANGUAGES = [
  { value: 'python', label: 'Python' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'java', label: 'Java' },
  { value: 'cpp', label: 'C++' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
  { value: 'csharp', label: 'C#' },
] as const;
