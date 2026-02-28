import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ThinkingCollapseProps {
  text: string;
  isStreaming?: boolean;
}

export const ThinkingCollapse: React.FC<ThinkingCollapseProps> = ({
  text,
  isStreaming,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  // Auto-expand when streaming starts with content
  useEffect(() => {
    if (isStreaming && text.trim() && !isOpen) {
      setIsOpen(true);
    }
  }, [isStreaming, text, isOpen]);

  if (!text.trim()) {
    return null;
  }

  return (
    <div className="thinking-collapse mb-3">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-300 transition-colors"
      >
        <svg
          className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-90' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span>Thinking</span>
        {isStreaming && (
          <span className="thinking-indicator ml-1">...</span>
        )}
      </button>
      {isOpen && (
        <div className="mt-2 pl-4 text-sm text-zinc-400 italic border-l-2 border-zinc-700">
          <div className="prose prose-invert prose-sm max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {text}
            </ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
};
