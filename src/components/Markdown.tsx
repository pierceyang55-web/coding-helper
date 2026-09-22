'use client';

import { useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';

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
        rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        components={{
          pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
