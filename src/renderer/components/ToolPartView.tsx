import React, { useState } from 'react';
import type { Part } from '../../shared/types';

interface ToolPartViewProps {
  part: Part;
}

// Chevron icons for expand/collapse
const ChevronRight: React.FC = () => (
  <svg
    className="w-4 h-4 text-zinc-400"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M9 5l7 7-7 7"
    />
  </svg>
);

const ChevronDown: React.FC = () => (
  <svg
    className="w-4 h-4 text-zinc-400"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M19 9l-7 7-7-7"
    />
  </svg>
);

export const ToolPartView: React.FC<ToolPartViewProps> = ({ part }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (part.type === 'text') {
    return null;
  }

  if (part.type === 'tool-call') {
    return (
      <div className="my-2 border border-zinc-700 rounded-lg overflow-hidden">
        <div
          className="bg-zinc-800 px-3 py-2 text-sm flex items-center gap-2 cursor-pointer hover:bg-zinc-750"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? <ChevronDown /> : <ChevronRight />}
          <svg
            className="w-4 h-4 text-zinc-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
          <span className="font-mono text-zinc-300">{part.toolName}</span>
        </div>
        {isExpanded && (
          <div className="bg-zinc-900 px-3 py-2">
            <pre className="text-xs text-zinc-400 overflow-x-auto">
              {JSON.stringify(part.args, null, 2)}
            </pre>
          </div>
        )}
      </div>
    );
  }

  if (part.type === 'tool-result') {
    return (
      <div
        className={`my-2 border rounded-lg overflow-hidden ${
          part.isError ? 'border-red-800' : 'border-zinc-700'
        }`}
      >
        <div
          className={`px-3 py-2 text-sm flex items-center gap-2 cursor-pointer ${
            part.isError
              ? 'bg-red-900/30 hover:bg-red-900/40'
              : 'bg-zinc-800 hover:bg-zinc-750'
          }`}
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? <ChevronDown /> : <ChevronRight />}
          {part.isError ? (
            <svg
              className="w-4 h-4 text-red-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          ) : (
            <svg
              className="w-4 h-4 text-green-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          )}
          <span className="font-mono text-zinc-300">Result: {part.toolName}</span>
        </div>
        {isExpanded && (
          <div className="bg-zinc-900 px-3 py-2">
            <pre className="text-xs text-zinc-400 overflow-x-auto max-h-40">
              {typeof part.result === 'string'
                ? part.result
                : JSON.stringify(part.result, null, 2)}
            </pre>
          </div>
        )}
      </div>
    );
  }

  return null;
};
