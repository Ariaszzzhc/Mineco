import React, { useState } from 'react';
import type { Part } from '../../shared/types';
import { ToolPartView } from './ToolPartView';

interface ToolGroupCollapseProps {
  parts: Part[];
}

export const ToolGroupCollapse: React.FC<ToolGroupCollapseProps> = ({ parts }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // Count unique tool calls (each tool has a call and a result)
  const toolCallCount = parts.filter(p => p.type === 'tool-call').length;

  return (
    <div className="my-2 border border-zinc-700 rounded-lg overflow-hidden">
      {/* Header - clickable */}
      <div
        className="bg-zinc-800 px-3 py-2 text-sm flex items-center gap-2 cursor-pointer hover:bg-zinc-750"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {isExpanded ? (
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
        ) : (
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
        )}
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
        <span className="font-mono text-zinc-300">
          {toolCallCount} 工具调用
        </span>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="bg-zinc-900 px-3 py-2 space-y-1">
          {parts.map((part, idx) => (
            <ToolPartView key={idx} part={part} />
          ))}
        </div>
      )}
    </div>
  );
};
