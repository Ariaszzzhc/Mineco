import React, { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, Wrench } from 'lucide-react';
import type { Part, ToolCallPart, ToolResultPart } from '../../shared/types';
import { ToolPartView } from './ToolPartView';

interface ToolGroupCollapseProps {
  parts: Part[];
}

/**
 * Pair tool calls with their corresponding results
 */
const pairToolCallsWithResults = (parts: Part[]): Array<{ call: ToolCallPart; result?: ToolResultPart }> => {
  const pairs: Array<{ call: ToolCallPart; result?: ToolResultPart }> = [];
  const resultMap = new Map<string, ToolResultPart>();

  // First pass: collect all results by toolCallId
  for (const part of parts) {
    if (part.type === 'tool-result') {
      resultMap.set(part.toolCallId, part);
    }
  }

  // Second pass: pair calls with results
  for (const part of parts) {
    if (part.type === 'tool-call') {
      pairs.push({
        call: part,
        result: resultMap.get(part.toolCallId),
      });
    }
  }

  return pairs;
};

export const ToolGroupCollapse: React.FC<ToolGroupCollapseProps> = ({ parts }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const toolPairs = useMemo(() => pairToolCallsWithResults(parts), [parts]);
  const toolCallCount = toolPairs.length;

  return (
    <div className="my-3 border border-border rounded-md overflow-hidden">
      {/* Header - clickable */}
      <div
        className="bg-surface px-3 py-2 text-sm flex items-center gap-2 cursor-pointer hover:bg-hover transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {isExpanded ? (
          <ChevronDown size={14} className="text-text-secondary" strokeWidth={1.5} />
        ) : (
          <ChevronRight size={14} className="text-text-secondary" strokeWidth={1.5} />
        )}
        <Wrench size={14} className="text-text-secondary" strokeWidth={1.5} />
        <span className="font-mono text-text-secondary text-xs">
          {toolCallCount} tool{toolCallCount !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="bg-surface-elevated px-3 py-2 space-y-1 border-t border-border">
          {toolPairs.map((pair, idx) => (
            <ToolPartView key={pair.call.toolCallId || idx} toolCall={pair.call} toolResult={pair.result} />
          ))}
        </div>
      )}
    </div>
  );
};
