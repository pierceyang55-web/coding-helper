export type Mode = 'fast' | 'medium' | 'fine';

export type ResultStatus = 'queued' | 'streaming' | 'done' | 'timeout' | 'error';

export interface Submission {
  id: string;
  user_id: string;
  image_path: string;
  language: string;
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
  elapsed_ms: number | null;
  started_at: string | null;
  updated_at: string;
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
