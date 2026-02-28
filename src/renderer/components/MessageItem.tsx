import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Message, Part } from '../../shared/types';
import { ToolGroupCollapse } from './ToolGroupCollapse';

interface MessageItemProps {
  message: Message;
  isStreaming?: boolean;
  pendingParts?: Part[];
}

export const MessageItem: React.FC<MessageItemProps> = ({
  message,
  isStreaming,
  pendingParts,
}) => {
  const parts = isStreaming && pendingParts ? pendingParts : message.parts;
  const isUser = message.role === 'user';

  // Separate tool parts and text parts
  const toolParts = parts.filter((p) => p.type !== 'text');
  const textParts = parts.filter((p) => p.type === 'text');

  return (
    <div
      className={`py-4 px-6 ${isUser ? 'bg-transparent' : 'bg-zinc-800/50'}`}
    >
      <div className="max-w-3xl mx-auto">
        {/* Role indicator */}
        <div className="flex items-center gap-2 mb-2">
          <div
            className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
              isUser ? 'bg-blue-600 text-white' : 'bg-orange-600 text-white'
            }`}
          >
            {isUser ? 'U' : 'M'}
          </div>
          <span className="text-sm font-medium text-zinc-400">
            {isUser ? 'You' : 'Manong'}
          </span>
          {isStreaming && (
            <span className="text-xs text-zinc-500 streaming-indicator">
              thinking...
            </span>
          )}
        </div>

        {/* Content */}
        <div className="pl-8">
          {/* Tool calls grouped in collapsible section */}
          {toolParts.length > 0 && <ToolGroupCollapse parts={toolParts} />}

          {/* Text content */}
          {textParts.map((part, idx) => {
            if (part.type === 'text') {
              return (
                <div key={idx} className="prose prose-invert max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {part.text}
                  </ReactMarkdown>
                </div>
              );
            }
            return null;
          })}

          {/* Show typing indicator if streaming with no text yet */}
          {isStreaming && parts.every((p) => p.type !== 'text' || !p.text) && (
            <div className="text-zinc-500 text-sm streaming-indicator">
              Waiting for response...
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
