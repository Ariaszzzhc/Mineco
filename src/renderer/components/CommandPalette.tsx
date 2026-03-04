import React, { useState, useEffect, useRef, useMemo } from 'react';
import { SHORTCUTS } from '../hooks/shortcuts';
import type { ShortcutContext, ShortcutDefinition } from '../hooks/shortcuts';
import { useTranslation } from '../i18n';
import type { TranslationKey } from '../i18n';
import { en } from '../i18n/locales/en';

const isMac = window.manong.platform === 'darwin';

function formatShortcut(s: ShortcutDefinition): string {
  const parts: string[] = [];
  if (s.mod) parts.push(isMac ? '⌘' : 'Ctrl');
  if (s.shift) parts.push(isMac ? '⇧' : 'Shift');

  let keyLabel = s.key;
  if (s.key === 'ArrowDown') keyLabel = '↓';
  else if (s.key === 'ArrowUp') keyLabel = '↑';
  else if (s.key === 'Escape') keyLabel = 'Esc';
  else if (s.key === 'Tab') keyLabel = 'Tab';
  else keyLabel = s.key.toUpperCase();

  parts.push(keyLabel);
  return isMac ? parts.join('') : parts.join('+');
}

const EXCLUDED_IDS = new Set(['stopGeneration', 'commandPalette', 'closeWindow']);

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  context: ShortcutContext;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ open, onClose, context }) => {
  const t = useTranslation();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const commands = useMemo(() => {
    return SHORTCUTS
      .filter((s) => !EXCLUDED_IDS.has(s.id))
      .map((s) => ({
        shortcut: s,
        label: t[s.labelKey as TranslationKey] ?? s.labelKey,
        // Always keep the English label for cross-language search
        labelEn: en[s.labelKey as TranslationKey] ?? s.labelKey,
        hint: formatShortcut(s),
      }));
  }, [t]);

  const filtered = useMemo(() => {
    if (!query) return commands;
    const q = query.toLowerCase();
    return commands.filter((c) =>
      c.label.toLowerCase().includes(q) ||
      c.labelEn.toLowerCase().includes(q) ||
      c.shortcut.id.toLowerCase().includes(q)
    );
  }, [commands, query]);

  // Reset state when opened
  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const item = listRef.current.children[selectedIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const executeCommand = (index: number) => {
    const cmd = filtered[index];
    if (!cmd) return;
    onClose();
    cmd.shortcut.action(context);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((i) => (i + 1) % filtered.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((i) => (i - 1 + filtered.length) % filtered.length);
        break;
      case 'Enter':
        e.preventDefault();
        executeCommand(selectedIndex);
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      onClick={onClose}
      onKeyDown={handleKeyDown}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      {/* Palette */}
      <div
        className="relative w-full max-w-md bg-surface border border-border rounded-lg shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
          <svg className="w-4 h-4 text-text-secondary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-transparent text-sm text-text-primary placeholder-text-secondary outline-none"
            placeholder={t['commandPalette.placeholder']}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
          />
        </div>

        {/* Command list */}
        <div ref={listRef} className="max-h-[300px] overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-3 py-4 text-sm text-text-secondary text-center">
              No matching commands
            </div>
          ) : (
            filtered.map((cmd, i) => (
              <button
                key={cmd.shortcut.id}
                className={`w-full flex items-center justify-between px-3 py-2 text-sm cursor-pointer transition-colors ${
                  i === selectedIndex
                    ? 'bg-active text-primary'
                    : 'text-text-primary hover:bg-hover'
                }`}
                onClick={() => executeCommand(i)}
                onMouseEnter={() => setSelectedIndex(i)}
              >
                <span>{cmd.label}</span>
                <kbd className={`text-xs font-mono px-1.5 py-0.5 rounded ${
                  i === selectedIndex
                    ? 'bg-hover text-primary'
                    : 'bg-surface-elevated text-text-secondary'
                }`}>
                  {cmd.hint}
                </kbd>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
