import React, { useEffect, useCallback } from 'react';
import { useAppStore } from '../stores/app';
import type { AgentState } from '../../shared/agent-types';
import { User, Bot, Loader2, CheckCircle, Clock, AlertCircle, MinusCircle } from 'lucide-react';

const StatusIcon: React.FC<{ status: AgentState['status'] }> = ({ status }) => {
  const statusConfig: Record<AgentState['status'], { icon: React.ReactNode; color: string; label: string }> = {
    idle: { icon: <Clock size={12} />, color: 'text-yellow-500', label: 'Idle' },
    running: { icon: <Loader2 size={12} className="animate-spin" />, color: 'text-green-500', label: 'Running' },
    waiting: { icon: <AlertCircle size={12} />, color: 'text-blue-500', label: 'Waiting' },
    completed: { icon: <CheckCircle size={12} />, color: 'text-gray-500', label: 'Completed' },
    shutdown: { icon: <MinusCircle size={12} />, color: 'text-red-500', label: 'Shutdown' },
  };

  const config = statusConfig[status];
  return (
    <span className={`flex items-center gap-1 ${config.color}`} title={config.label}>
      {config.icon}
      <span className="text-[10px]">{config.label}</span>
    </span>
  );
};

const MemberItem: React.FC<{
  id: string | null;
  name: string;
  role?: string;
  status?: AgentState['status'];
  inboxCount?: number;
  isActive: boolean;
  onClick: () => void;
}> = ({ id, name, role, status, inboxCount, isActive, onClick }) => {
  return (
    <button
      onClick={onClick}
      className={`w-full p-2 rounded text-left text-xs transition-colors ${
        isActive
          ? 'bg-primary/20 border border-primary/50 text-text-primary'
          : 'bg-surface-elevated border border-border hover:border-primary/30 text-text-primary hover:bg-hover'
      }`}
    >
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          {id === null ? (
            <User size={12} className="text-primary" />
          ) : (
            <Bot size={12} />
          )}
          <span className="font-medium">{name}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {inboxCount !== undefined && inboxCount > 0 && (
            <span className="px-1 py-0.5 rounded-full bg-primary/30 text-primary text-[9px]">
              {inboxCount}
            </span>
          )}
          {status && <StatusIcon status={status} />}
        </div>
      </div>
      {role && (
        <p className="text-[10px] text-text-secondary truncate pl-4">{role}</p>
      )}
    </button>
  );
};

export const TeamPanel: React.FC = () => {
  const {
    teammates,
    activeAgentId,
    setTeammates,
    setActiveAgent,
  } = useAppStore();

  useEffect(() => {
    const loadTeammates = async () => {
      try {
        const list = await window.manong.teammate.list();
        setTeammates(list);
      } catch (error) {
        console.error('Failed to load teammates:', error);
      }
    };

    loadTeammates();

    const unsubscribe = window.manong.teammate.onEvent((event) => {
      if (event.type === 'spawned') {
        loadTeammates();
      } else if (event.type === 'status_changed') {
        const data = event.data as { id: string; status: AgentState['status'] };
        setTeammates((prev) =>
          prev.map((t) => (t.id === data.id ? { ...t, status: data.status } : t))
        );
      } else if (event.type === 'shutdown') {
        const data = event.data as { id: string };
        setTeammates((prev) => prev.filter((t) => t.id !== data.id));
      }
    });

    return () => {
      unsubscribe();
    };
  }, [setTeammates]);

  const handleSelectAgent = useCallback((agentId: string | null) => {
    setActiveAgent(agentId);
  }, [setActiveAgent]);

  return (
    <div className="p-2 space-y-2">
      {/* Team Lead */}
      <div className="space-y-1">
        <MemberItem
          id={null}
          name="Team Lead"
          role="Main Agent (You)"
          isActive={activeAgentId === null}
          onClick={() => handleSelectAgent(null)}
        />

        {/* Divider */}
        {teammates.length > 0 && (
          <div className="flex items-center gap-2 py-1">
            <div className="flex-1 border-t border-border" />
            <span className="text-[9px] text-text-secondary/50">Teammates</span>
            <div className="flex-1 border-t border-border" />
          </div>
        )}

        {/* Teammates */}
        {teammates.map((teammate) => (
          <div key={teammate.id} className="space-y-1">
            <MemberItem
              id={teammate.id}
              name={teammate.name}
              role={teammate.role}
              status={teammate.status}
              inboxCount={teammate.inbox.length}
              isActive={activeAgentId === teammate.id}
              onClick={() => handleSelectAgent(teammate.id)}
            />
          </div>
        ))}

        {/* Empty state for teammates */}
        {teammates.length === 0 && (
          <div className="py-2 text-center text-text-secondary/50 text-[10px]">
            No teammates yet. Use <code className="text-primary">spawn_teammate</code> tool.
          </div>
        )}
      </div>
    </div>
  );
};
