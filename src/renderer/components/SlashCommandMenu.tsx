import React, { useRef, useEffect } from 'react';
import type { Skill } from '../../shared/types';

interface SlashCommandMenuProps {
  skills: Skill[];
  filter: string;
  selectedIndex: number;
  onSelect: (skill: Skill) => void;
}

export const SlashCommandMenu: React.FC<SlashCommandMenuProps> = ({
  skills,
  filter,
  selectedIndex,
  onSelect,
}) => {
  const listRef = useRef<HTMLUListElement>(null);

  const filtered = skills.filter(
    (s) =>
      s.name.toLowerCase().includes(filter.toLowerCase()) ||
      s.description.toLowerCase().includes(filter.toLowerCase())
  );

  // Scroll selected item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const item = list.children[selectedIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (filtered.length === 0) return null;

  return (
    <div className="absolute bottom-full left-0 right-0 mb-1 z-20">
      <div className="mx-auto max-w-3xl">
        <div className="rounded-lg border border-border bg-surface shadow-xl overflow-hidden">
          <ul ref={listRef} className="max-h-52 overflow-y-auto py-1">
            {filtered.map((skill, index) => (
              <li key={skill.name}>
                <button
                  onMouseDown={(e) => {
                    e.preventDefault(); // prevent textarea blur
                    onSelect(skill);
                  }}
                  className={`w-full px-3 py-2 text-left transition-colors ${
                    index === selectedIndex
                      ? 'bg-primary/10 text-primary'
                      : 'hover:bg-surface-hover'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm">/{skill.name}</span>
                    <span className="text-[10px] text-text-secondary px-1.5 py-0.5 rounded bg-surface-elevated border border-border">
                      {skill.source}
                    </span>
                  </div>
                  <p className="text-xs text-text-secondary mt-0.5 line-clamp-1">
                    {skill.description}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};
