"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

const components: Components = {
  h1: ({ children }) => (
    <h1 className="text-xl font-bold text-gray-900 mt-4 mb-2">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-lg font-bold text-gray-900 mt-3 mb-2">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-base font-bold text-gray-800 mt-3 mb-1">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="text-sm font-bold text-gray-800 mt-2 mb-1">{children}</h4>
  ),
  p: ({ children }) => (
    <p className="mb-2 leading-relaxed">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="list-disc list-inside mb-2 space-y-1 ml-1">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal list-inside mb-2 space-y-1 ml-1">{children}</ol>
  ),
  li: ({ children }) => (
    <li className="leading-relaxed">{children}</li>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-gray-900">{children}</strong>
  ),
  em: ({ children }) => (
    <em className="italic text-gray-700">{children}</em>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-4 border-indigo-300 pl-3 my-2 text-gray-600 italic">
      {children}
    </blockquote>
  ),
  code: ({ children, className }) => {
    const isInline = !className;
    if (isInline) {
      return (
        <code className="bg-gray-100 text-indigo-700 px-1.5 py-0.5 rounded text-xs font-mono">
          {children}
        </code>
      );
    }
    return (
      <code className="block bg-gray-900 text-green-400 p-3 rounded-lg text-xs font-mono overflow-x-auto my-2">
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="my-2">{children}</pre>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto my-3 rounded-lg border border-gray-200">
      <table className="min-w-full text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-indigo-50 text-indigo-800">{children}</thead>
  ),
  tbody: ({ children }) => (
    <tbody className="divide-y divide-gray-100">{children}</tbody>
  ),
  tr: ({ children }) => (
    <tr className="hover:bg-gray-50 transition">{children}</tr>
  ),
  th: ({ children }) => (
    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{children}</td>
  ),
  hr: () => <hr className="my-3 border-gray-200" />,
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-indigo-600 hover:text-indigo-800 underline"
    >
      {children}
    </a>
  ),
};

export default function MarkdownRenderer({ content, className = "" }: MarkdownRendererProps) {
  return (
    <div className={`prose-sm max-w-none ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}

