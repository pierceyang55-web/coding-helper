'use client';

import { useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';

/**
 * The answer contains <details>/<summary> so each solution can fold its code
 * and its complexity derivation away. That means rendering raw HTML, and the
 * HTML comes from a model reading a photograph — a photo could contain text
 * aimed at the model rather than at the reader. So it is sanitized: details,
 * summary and the highlighter's class names are allowed through, everything
 * else that could execute is not.
 *
 * Order matters. rehypeRaw turns the HTML into real nodes, rehypeSanitize
 * prunes them, and rehypeHighlight runs last so the class names it adds are
 * not themselves stripped.
 */
const schema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), 'details', 'summary'],
  attributes: {
    ...defaultSchema.attributes,
    details: [...(defaultSchema.attributes?.details ?? []), 'open'],
    code: [...(defaultSchema.attributes?.code ?? []), ['className', /^language-./, 'math-inline']],
    span: [...(defaultSchema.attributes?.span ?? []), ['className', /^hljs-./]],
  },
};

function CodeBlock({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);

  async function copy() {
    const text = ref.current?.textContent ?? '';
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked — nothing useful to do */
    }
  }

  return (
    <div className="group relative my-4 overflow-hidden rounded-xl ring-1 ring-ink-800">
      <button
        onClick={copy}
        className="absolute right-2 top-2 z-10 rounded-lg bg-ink-800/90 px-2.5 py-1 text-[11px] font-medium text-ink-300 opacity-0 ring-1 ring-ink-700 backdrop-blur transition hover:text-white group-hover:opacity-100 focus:opacity-100"
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
      <pre ref={ref}>{children}</pre>
    </div>
  );
}

export default function Markdown({ children }: { children: string }) {
  return (
    <div className="prose-helper">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[
          rehypeRaw,
          [rehypeSanitize, schema],
          [rehypeHighlight, { detect: true, ignoreMissing: true }],
        ]}
        components={{
          pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
