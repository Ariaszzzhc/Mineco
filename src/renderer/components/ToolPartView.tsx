import React, { useState } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Wrench,
  CheckCircle,
  AlertCircle,
  FileText,
  FileEdit,
  FolderOpen,
  Search,
  Terminal,
  MessageCircle,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import type { ToolCallPart, ToolResultPart } from '../../shared/types';

interface ToolPartViewProps {
  toolCall: ToolCallPart;
  toolResult?: ToolResultPart;
}

const isMCPTool = (toolName: string): boolean => {
  return toolName.startsWith('mcp__');
};

const formatToolName = (toolName: string): { display: string; server?: string } => {
  if (isMCPTool(toolName)) {
    const parts = toolName.split('__');
    if (parts.length >= 3) {
      return {
        display: parts.slice(2).join('__'),
        server: parts[1],
      };
    }
  }
  return { display: toolName };
};

/**
 * Generate a human-readable action summary based on tool name and arguments
 */
const generateActionSummary = (
  toolName: string,
  args: Record<string, unknown>
): { summary: string; icon: LucideIcon } => {
  // Handle built-in tools
  switch (toolName) {
    case 'read_file': {
      const filePath = String(args.file_path || '');
      const fileName = filePath.split('/').pop() || filePath;
      const offset = args.offset as number | undefined;
      const limit = args.limit as number | undefined;

      if (offset !== undefined && limit !== undefined) {
        const endLine = offset + limit - 1;
        return { summary: `Read ${fileName} (L${offset}-${endLine})`, icon: FileText };
      }
      return { summary: `Read ${fileName}`, icon: FileText };
    }

    case 'write_file': {
      const filePath = String(args.file_path || '');
      const fileName = filePath.split('/').pop() || filePath;
      return { summary: `Write ${fileName}`, icon: FileEdit };
    }

    case 'edit_file': {
      const filePath = String(args.file_path || '');
      const fileName = filePath.split('/').pop() || filePath;
      return { summary: `Edit ${fileName}`, icon: FileEdit };
    }

    case 'list_dir': {
      const path = String(args.path || '');
      const dirName = path ? path.split('/').pop() || path : 'current directory';
      return { summary: `List ${dirName}`, icon: FolderOpen };
    }

    case 'search_file': {
      const pattern = String(args.pattern || '');
      return { summary: `Search "${pattern}"`, icon: Search };
    }

    case 'run_shell': {
      const command = String(args.command || '');
      // Truncate long commands
      const displayCommand = command.length > 40 ? command.slice(0, 40) + '...' : command;
      return { summary: `Run: ${displayCommand}`, icon: Terminal };
    }

    case 'ask': {
      const questions = args.questions as Array<{ header?: string; question?: string }> | undefined;
      if (questions && questions.length > 0) {
        const header = questions[0].header || questions[0].question || 'user';
        const truncatedHeader = header.length > 30 ? header.slice(0, 30) + '...' : header;
        return { summary: `Ask: ${truncatedHeader}`, icon: MessageCircle };
      }
      return { summary: 'Ask user', icon: MessageCircle };
    }

    case 'skill': {
      const skillName = String(args.skill || args.name || '');
      return { summary: `Skill: ${skillName}`, icon: Sparkles };
    }

    default: {
      // MCP tools or unknown tools
      if (isMCPTool(toolName)) {
        const { display } = formatToolName(toolName);
        return { summary: display, icon: Wrench };
      }
      return { summary: toolName, icon: Wrench };
    }
  }
};

export const ToolPartView: React.FC<ToolPartViewProps> = ({ toolCall, toolResult }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const { summary, icon: Icon } = generateActionSummary(toolCall.toolName, toolCall.args);
  const isMCP = isMCPTool(toolCall.toolName);
  const { server } = formatToolName(toolCall.toolName);
  const isError = toolResult?.isError;
  const isPending = !toolResult;

  return (
    <div
      className={`my-1 border rounded overflow-hidden ${
        isError ? 'border-red-800/50' : 'border-border'
      }`}
    >
      <div
        className={`px-3 py-1.5 text-sm flex items-center gap-2 cursor-pointer transition-colors ${
          isError
            ? 'bg-red-900/20 hover:bg-red-900/30'
            : 'bg-surface-elevated hover:bg-hover'
        }`}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {isExpanded ? (
          <ChevronDown size={12} className="text-text-secondary" strokeWidth={1.5} />
        ) : (
          <ChevronRight size={12} className="text-text-secondary" strokeWidth={1.5} />
        )}
        <Icon size={12} className={isMCP ? 'text-primary' : 'text-text-secondary'} strokeWidth={1.5} />
        <span className="font-mono text-xs text-text-primary">{summary}</span>
        {isMCP && server && (
          <span className="text-[10px] px-1.5 py-0.5 bg-primary/20 text-primary rounded font-mono">
            MCP: {server}
          </span>
        )}
        {/* Status indicator */}
        {isPending ? (
          <span className="ml-auto text-[10px] px-1.5 py-0.5 bg-yellow-500/20 text-yellow-500 rounded font-mono animate-pulse">
            pending
          </span>
        ) : isError ? (
          <AlertCircle size={12} className="ml-auto text-accent-red" strokeWidth={1.5} />
        ) : (
          <CheckCircle size={12} className="ml-auto text-accent-green" strokeWidth={1.5} />
        )}
      </div>
      {isExpanded && (
        <div className="bg-surface-elevated border-t border-border">
          {/* Arguments section */}
          <div className="px-3 py-2 border-b border-border/50">
            <div className="text-[10px] uppercase text-text-secondary mb-1 font-medium">Arguments</div>
            <pre className="text-[11px] text-text-secondary overflow-x-auto font-mono">
              {JSON.stringify(toolCall.args, null, 2)}
            </pre>
          </div>
          {/* Result section */}
          {toolResult && (
            <div className="px-3 py-2">
              <div className="text-[10px] uppercase text-text-secondary mb-1 font-medium">Result</div>
              <pre className="text-[11px] text-text-secondary overflow-x-auto max-h-40 font-mono">
                {typeof toolResult.result === 'string'
                  ? toolResult.result
                  : JSON.stringify(toolResult.result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
