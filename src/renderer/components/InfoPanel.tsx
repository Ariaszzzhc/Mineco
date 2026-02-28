import React from 'react';
import { useAppStore } from '../stores/app';

export const InfoPanel: React.FC = () => {
  const { currentSession, isStreaming } = useAppStore();

  // Count tool calls
  const toolCalls = currentSession?.messages.reduce((acc, msg) => {
    return (
      acc +
      msg.parts.filter(
        (p) => p.type === 'tool-call' || p.type === 'tool-result'
      ).length
    );
  }, 0);

  return (
    <div className="w-72 bg-zinc-900 border-l border-zinc-800 p-4 overflow-y-auto">
      <h3 className="text-sm font-semibold text-zinc-400 uppercase mb-4">
        Session Info
      </h3>

      {/* Working Directory */}
      <div className="mb-6">
        <label className="text-xs text-zinc-500 uppercase">Working Directory</label>
        <div className="mt-1 text-sm text-zinc-300 font-mono break-all">
          {currentSession?.workingDir || 'Not set'}
        </div>
      </div>

      {/* Stats */}
      <div className="mb-6">
        <label className="text-xs text-zinc-500 uppercase">Statistics</label>
        <div className="mt-2 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-zinc-400">Messages</span>
            <span className="text-zinc-300">
              {currentSession?.messages.length ?? 0}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-zinc-400">Tool Calls</span>
            <span className="text-zinc-300">{toolCalls ?? 0}</span>
          </div>
        </div>
      </div>

      {/* Status */}
      <div className="mb-6">
        <label className="text-xs text-zinc-500 uppercase">Status</label>
        <div className="mt-2 flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${
              isStreaming ? 'bg-green-500 streaming-indicator' : 'bg-zinc-500'
            }`}
          />
          <span className="text-sm text-zinc-400">
            {isStreaming ? 'Processing...' : 'Idle'}
          </span>
        </div>
      </div>

      {/* Recent Changes */}
      <div>
        <label className="text-xs text-zinc-500 uppercase">Recent Changes</label>
        <div className="mt-2 text-sm text-zinc-500">
          {currentSession?.messages.some((m) =>
            m.parts.some(
              (p) =>
                p.type === 'tool-call' &&
                ['write_file', 'edit_file'].includes(p.toolName)
            )
          ) ? (
            <div className="space-y-1">
              {currentSession?.messages
                .flatMap((m) =>
                  m.parts.filter(
                    (p) =>
                      p.type === 'tool-call' &&
                      ['write_file', 'edit_file'].includes(p.toolName)
                  )
                )
                .slice(-5)
                .map((p, idx) => {
                  if (p.type !== 'tool-call') return null;
                  const args = p.args as { file_path?: string };
                  return (
                    <div
                      key={idx}
                      className="text-zinc-400 font-mono text-xs truncate"
                    >
                      {args.file_path}
                    </div>
                  );
                })}
            </div>
          ) : (
            'No changes yet'
          )}
        </div>
      </div>
    </div>
  );
};
