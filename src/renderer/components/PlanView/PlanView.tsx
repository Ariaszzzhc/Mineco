import React, { useState, useRef, useCallback, useMemo } from 'react';
import {
  Trash2,
  Plus,
  Replace,
  MessageSquare,
  X,
  Check,
  ChevronDown,
  GitCompare,
  Play,
  RotateCcw,
  ClipboardList,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAppStore } from '../../stores/app';
import type { PlanBlock, PlanAnnotation, PlanAnnotationType } from '../../../shared/types';
import { useTranslation } from '../../i18n';
import type { TranslationKey } from '../../i18n';

const ANNOTATION_COLORS: Record<PlanAnnotationType, string> = {
  delete: 'bg-red-500/20 border-red-500/40',
  insert: 'bg-green-500/20 border-green-500/40',
  replace: 'bg-blue-500/20 border-blue-500/40',
  comment: 'bg-yellow-500/20 border-yellow-500/40',
};

const ANNOTATION_ICONS: Record<PlanAnnotationType, React.ReactNode> = {
  delete: <Trash2 size={12} />,
  insert: <Plus size={12} />,
  replace: <Replace size={12} />,
  comment: <MessageSquare size={12} />,
};

const ANNOTATION_LABELS: Record<PlanAnnotationType, TranslationKey> = {
  delete: 'plan.annotate.delete',
  insert: 'plan.annotate.insert',
  replace: 'plan.annotate.replace',
  comment: 'plan.annotate.comment',
};

// AnnotationToolbar — floating toolbar appearing above text selection
const AnnotationToolbar: React.FC<{
  position: { top: number; left: number };
  onAction: (type: PlanAnnotationType) => void;
  onClose: () => void;
}> = ({ position, onAction, onClose }) => {
  const t = useTranslation();
  const types: PlanAnnotationType[] = ['delete', 'insert', 'replace', 'comment'];

  return (
    <div
      className="fixed z-50 flex items-center gap-1 p-1 bg-surface-elevated border border-border rounded-lg shadow-xl animate-fade-in"
      style={{ top: position.top - 40, left: position.left }}
    >
      {types.map((type) => (
        <button
          key={type}
          onClick={() => onAction(type)}
          className="flex items-center gap-1 px-2 py-1 text-[11px] rounded hover:bg-hover text-text-secondary hover:text-text-primary transition-colors"
          title={t[ANNOTATION_LABELS[type]]}
        >
          {ANNOTATION_ICONS[type]}
          <span>{t[ANNOTATION_LABELS[type]]}</span>
        </button>
      ))}
      <button
        onClick={onClose}
        className="p-1 text-text-secondary hover:text-text-primary rounded hover:bg-hover transition-colors ml-1"
      >
        <X size={12} />
      </button>
    </div>
  );
};

// AnnotationForm — inline form for entering annotation content
const AnnotationForm: React.FC<{
  type: PlanAnnotationType;
  originalText: string;
  onSubmit: (text: string) => void;
  onCancel: () => void;
}> = ({ type, originalText, onSubmit, onCancel }) => {
  const [text, setText] = useState('');
  const t = useTranslation();

  const handleSubmit = () => {
    onSubmit(text);
  };

  if (type === 'delete') {
    return (
      <div className="flex items-center gap-2 p-2 bg-red-500/10 border border-red-500/30 rounded-lg mt-1">
        <span className="text-[11px] text-red-400 flex-1">
          {t['plan.annotate.deleteConfirm']}: &quot;{originalText.slice(0, 50)}{originalText.length > 50 ? '...' : ''}&quot;
        </span>
        <button onClick={handleSubmit} className="p-1 text-red-400 hover:bg-red-500/20 rounded">
          <Check size={14} />
        </button>
        <button onClick={onCancel} className="p-1 text-text-secondary hover:bg-hover rounded">
          <X size={14} />
        </button>
      </div>
    );
  }

  const placeholder = type === 'comment' ? t['plan.annotate.commentPlaceholder'] :
    type === 'insert' ? t['plan.annotate.insertPlaceholder'] :
    t['plan.annotate.replacePlaceholder'];

  return (
    <div className={`flex flex-col gap-1 p-2 ${ANNOTATION_COLORS[type]} border rounded-lg mt-1`}>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-transparent text-text-primary text-[12px] resize-none focus:outline-none min-h-[40px] p-1"
        rows={2}
        autoFocus
      />
      <div className="flex justify-end gap-1">
        <button onClick={onCancel} className="px-2 py-0.5 text-[11px] text-text-secondary hover:bg-hover rounded">
          {t['settings.cancel']}
        </button>
        <button
          onClick={handleSubmit}
          disabled={!text.trim()}
          className="px-2 py-0.5 text-[11px] bg-primary text-on-primary rounded hover:bg-primary-hover disabled:opacity-50"
        >
          {t['plan.annotate.add']}
        </button>
      </div>
    </div>
  );
};

// PlanBlockView — single block component (selection handled by parent)
const PlanBlockView: React.FC<{
  block: PlanBlock;
  annotations: PlanAnnotation[];
}> = ({ block, annotations }) => {
  const hasAnnotations = annotations.length > 0;

  const renderContent = () => {
    if (block.type === 'code') {
      return (
        <pre className="text-[12px] leading-[18px] bg-surface-elevated p-3 rounded-lg overflow-x-auto font-mono">
          <code>{block.content}</code>
        </pre>
      );
    }

    return (
      <div className="prose prose-sm prose-invert max-w-none text-[13px] leading-relaxed [&>*]:my-0 [&>p]:my-0">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{block.content}</ReactMarkdown>
      </div>
    );
  };

  return (
    <div
      data-block-id={block.id}
      className={`py-1 px-2 rounded transition-colors cursor-text ${
        hasAnnotations ? 'border-l-2 border-primary/50 pl-3' : 'hover:bg-hover/30'
      }`}
    >
      {renderContent()}
    </div>
  );
};

// AnnotationSidebar — right panel listing all annotations
const AnnotationSidebar: React.FC<{
  annotations: PlanAnnotation[];
  blocks: PlanBlock[];
  onRemove: (id: string) => void;
}> = ({ annotations, blocks, onRemove }) => {
  const t = useTranslation();

  const grouped = useMemo(() => {
    const map = new Map<string, PlanAnnotation[]>();
    for (const a of annotations) {
      const list = map.get(a.blockId) || [];
      list.push(a);
      map.set(a.blockId, list);
    }
    return map;
  }, [annotations]);

  if (annotations.length === 0) {
    return (
      <div className="p-4 text-center text-text-secondary text-[12px]">
        {t['plan.annotate.noAnnotations']}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-3 overflow-y-auto">
      <h3 className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider">
        {t['plan.annotate.annotations']} ({annotations.length})
      </h3>
      {Array.from(grouped.entries()).map(([blockId, blockAnnotations]) => {
        const block = blocks.find(b => b.id === blockId);
        return (
          <div key={blockId} className="flex flex-col gap-1">
            <span className="text-[10px] text-text-secondary truncate">
              {block?.content.slice(0, 40)}...
            </span>
            {blockAnnotations.map((a) => (
              <div
                key={a.id}
                className={`flex items-start gap-2 p-2 rounded-lg border ${ANNOTATION_COLORS[a.type]}`}
              >
                <span className="mt-0.5">{ANNOTATION_ICONS[a.type]}</span>
                <div className="flex-1 min-w-0">
                  <span className="text-[10px] font-medium uppercase text-text-secondary">
                    {t[ANNOTATION_LABELS[a.type]]}
                  </span>
                  <p className="text-[11px] text-text-primary truncate">
                    &quot;{a.originalText.slice(0, 40)}{a.originalText.length > 40 ? '...' : ''}&quot;
                  </p>
                  {(a.newText || a.comment) && (
                    <p className="text-[11px] text-text-secondary mt-0.5">
                      → {a.newText || a.comment}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => onRemove(a.id)}
                  className="p-0.5 text-text-secondary hover:text-error rounded transition-colors"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
};

// PlanDiffView — version diff display
const PlanDiffView: React.FC<{
  oldMarkdown: string;
  newMarkdown: string;
}> = ({ oldMarkdown, newMarkdown }) => {
  const oldLines = oldMarkdown.split('\n');
  const newLines = newMarkdown.split('\n');

  const diffLines: Array<{ type: 'add' | 'remove' | 'same'; content: string }> = [];

  const oldSet = new Set(oldLines);
  const newSet = new Set(newLines);

  let oi = 0, ni = 0;
  while (oi < oldLines.length || ni < newLines.length) {
    if (oi < oldLines.length && ni < newLines.length && oldLines[oi] === newLines[ni]) {
      diffLines.push({ type: 'same', content: oldLines[oi] });
      oi++;
      ni++;
    } else if (oi < oldLines.length && !newSet.has(oldLines[oi])) {
      diffLines.push({ type: 'remove', content: oldLines[oi] });
      oi++;
    } else if (ni < newLines.length && !oldSet.has(newLines[ni])) {
      diffLines.push({ type: 'add', content: newLines[ni] });
      ni++;
    } else {
      if (oi < oldLines.length) {
        diffLines.push({ type: 'remove', content: oldLines[oi] });
        oi++;
      }
      if (ni < newLines.length) {
        diffLines.push({ type: 'add', content: newLines[ni] });
        ni++;
      }
    }
  }

  const lineStyles = {
    add: 'bg-green-500/10 text-green-400',
    remove: 'bg-red-500/10 text-red-400',
    same: 'text-text-secondary',
  };

  const prefixes = { add: '+', remove: '-', same: ' ' };

  return (
    <div className="font-mono text-[11px] leading-[18px] overflow-x-auto bg-surface-elevated rounded-lg p-2">
      {diffLines.map((line, idx) => (
        <div key={idx} className={`px-2 whitespace-pre ${lineStyles[line.type]}`}>
          <span className="select-none opacity-50 inline-block w-3">{prefixes[line.type]}</span>
          <span>{line.content}</span>
        </div>
      ))}
    </div>
  );
};

// PlanActions — bottom action bar
const PlanActions: React.FC<{
  annotationCount: number;
  onApprove: (mode: 'current' | 'new-session') => void;
  onRevise: (feedback: string) => void;
}> = ({ annotationCount, onApprove, onRevise }) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const t = useTranslation();

  const hasAnnotations = annotationCount > 0;

  if (hasAnnotations) {
    // With annotations: primary = "Request Changes" (submits directly), secondary = "Approve"
    return (
      <div className="flex items-center justify-between gap-3 p-3 border-t border-border bg-surface">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-primary bg-primary/10 px-2 py-0.5 rounded-full">
            {annotationCount} {t['plan.annotate.annotations'].toLowerCase()}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <div className="flex items-stretch">
              <button
                onClick={() => onApprove('current')}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] border border-border rounded-l-lg text-text-secondary hover:text-text-primary hover:bg-hover transition-colors"
              >
                <Play size={13} />
                {t['plan.approve.button']}
              </button>
              <button
                onClick={() => setShowDropdown(!showDropdown)}
                className="px-1.5 py-1.5 border border-l-0 border-border rounded-r-lg text-text-secondary hover:text-text-primary hover:bg-hover transition-colors"
              >
                <ChevronDown size={13} />
              </button>
            </div>
            {showDropdown && (
              <div className="absolute right-0 bottom-full mb-1 bg-surface-elevated border border-border rounded-lg shadow-xl overflow-hidden min-w-[180px] z-50">
                <button
                  onClick={() => { onApprove('current'); setShowDropdown(false); }}
                  className="w-full text-left px-3 py-2 text-[12px] hover:bg-hover transition-colors text-text-primary"
                >
                  {t['plan.approve.currentSession']}
                </button>
                <button
                  onClick={() => { onApprove('new-session'); setShowDropdown(false); }}
                  className="w-full text-left px-3 py-2 text-[12px] hover:bg-hover transition-colors text-text-primary border-t border-border"
                >
                  {t['plan.approve.newSession']}
                </button>
              </div>
            )}
          </div>

          <button
            onClick={() => onRevise('')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] bg-primary text-on-primary rounded-lg hover:bg-primary-hover transition-colors"
          >
            <RotateCcw size={13} />
            {t['plan.revise.button']}
          </button>
        </div>
      </div>
    );
  }

  // Without annotations: primary = "Approve" only
  return (
    <div className="flex items-center justify-end gap-3 p-3 border-t border-border bg-surface">
      <div className="relative">
        <div className="flex items-stretch">
          <button
            onClick={() => onApprove('current')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] bg-primary text-on-primary rounded-l-lg hover:bg-primary-hover transition-colors"
          >
            <Play size={13} />
            {t['plan.approve.button']}
          </button>
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className="px-1.5 py-1.5 bg-primary text-on-primary rounded-r-lg hover:bg-primary-hover transition-colors border-l border-on-primary/20"
          >
            <ChevronDown size={13} />
          </button>
        </div>
        {showDropdown && (
          <div className="absolute right-0 bottom-full mb-1 bg-surface-elevated border border-border rounded-lg shadow-xl overflow-hidden min-w-[180px] z-50">
            <button
              onClick={() => {
                onApprove('current');
                setShowDropdown(false);
              }}
              className="w-full text-left px-3 py-2 text-[12px] hover:bg-hover transition-colors text-text-primary"
            >
              {t['plan.approve.currentSession']}
            </button>
            <button
              onClick={() => {
                onApprove('new-session');
                setShowDropdown(false);
              }}
              className="w-full text-left px-3 py-2 text-[12px] hover:bg-hover transition-colors text-text-primary border-t border-border"
            >
              {t['plan.approve.newSession']}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// PlanView — main container
export const PlanView: React.FC = () => {
  const {
    activePlan,
    planAnnotations,
    planVersions,
    addPlanAnnotation,
    removePlanAnnotation,
    submitPlanDecision,
  } = useAppStore();
  const t = useTranslation();
  const [showDiff, setShowDiff] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);

  // Selection & annotation state (handled at container level for cross-block support)
  const [showToolbar, setShowToolbar] = useState(false);
  const [toolbarPos, setToolbarPos] = useState({ top: 0, left: 0 });
  const [selectedText, setSelectedText] = useState('');
  const [selectionBlockId, setSelectionBlockId] = useState<string | null>(null);
  const [selectionOffsets, setSelectionOffsets] = useState({ start: 0, end: 0 });
  const [annotatingType, setAnnotatingType] = useState<PlanAnnotationType | null>(null);
  const blocksContainerRef = useRef<HTMLDivElement>(null);

  const handleBlocksMouseUp = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !blocksContainerRef.current) return;

    const text = selection.toString().trim();
    if (!text) return;

    const range = selection.getRangeAt(0);
    if (!blocksContainerRef.current.contains(range.commonAncestorContainer)) return;

    // Find which block the selection starts in by traversing up from startContainer
    let node: Node | null = range.startContainer;
    let blockElement: HTMLElement | null = null;
    while (node && node !== blocksContainerRef.current) {
      if (node instanceof HTMLElement && node.dataset.blockId) {
        blockElement = node;
        break;
      }
      node = node.parentNode;
    }

    if (!blockElement) return;

    const blockId = blockElement.dataset.blockId!;
    const blockContent = blockElement.textContent || '';
    const startOffset = blockContent.indexOf(text);
    const endOffset = startOffset >= 0 ? startOffset + text.length : text.length;

    const rect = range.getBoundingClientRect();
    setSelectedText(text);
    setSelectionBlockId(blockId);
    setSelectionOffsets({ start: Math.max(0, startOffset), end: endOffset });
    setToolbarPos({ top: rect.top, left: rect.left + rect.width / 2 - 100 });
    setShowToolbar(true);
  }, []);

  const handleAnnotationAction = (type: PlanAnnotationType) => {
    setShowToolbar(false);
    setAnnotatingType(type);
  };

  const handleAnnotationSubmit = (text: string) => {
    if (!selectionBlockId || !annotatingType) return;

    const annotation: PlanAnnotation = {
      id: `ann-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      blockId: selectionBlockId,
      type: annotatingType,
      startOffset: selectionOffsets.start,
      endOffset: selectionOffsets.end,
      originalText: selectedText,
      newText: annotatingType === 'comment' ? undefined : text,
      comment: annotatingType === 'comment' ? text : undefined,
      createdAt: Date.now(),
    };
    addPlanAnnotation(annotation);
    setAnnotatingType(null);
    setSelectedText('');
    setSelectionBlockId(null);
    window.getSelection()?.removeAllRanges();
  };

  if (!activePlan) return null;

  const handleApprove = (mode: 'current' | 'new-session') => {
    submitPlanDecision({
      type: 'approve',
      executionMode: mode,
      annotations: planAnnotations,
    });
  };

  const handleRevise = (feedback: string) => {
    submitPlanDecision({
      type: 'revise',
      feedback: feedback || 'Please revise the plan.',
      annotations: planAnnotations,
    });
  };

  const previousVersion = planVersions.length > 1 ? planVersions[planVersions.length - 2] : null;
  const canShowDiff = previousVersion !== null;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface">
        <div className="flex items-center gap-2">
          <ClipboardList size={16} className="text-primary" />
          <h2 className="text-sm font-semibold text-text-primary">{t['plan.title']}</h2>
          <span className="text-[10px] text-text-secondary bg-surface-elevated px-2 py-0.5 rounded-full">
            v{activePlan.version}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {canShowDiff && (
            <button
              onClick={() => setShowDiff(!showDiff)}
              className={`flex items-center gap-1 px-2 py-1 text-[11px] rounded-md transition-colors ${
                showDiff ? 'bg-primary/10 text-primary' : 'text-text-secondary hover:text-text-primary hover:bg-hover'
              }`}
            >
              <GitCompare size={13} />
              {t['plan.showDiff']}
            </button>
          )}
          <button
            onClick={() => setShowSidebar(!showSidebar)}
            className={`flex items-center gap-1 px-2 py-1 text-[11px] rounded-md transition-colors ${
              showSidebar ? 'bg-primary/10 text-primary' : 'text-text-secondary hover:text-text-primary hover:bg-hover'
            }`}
          >
            <MessageSquare size={13} />
            {t['plan.annotate.annotations']}
            {planAnnotations.length > 0 && (
              <span className="bg-primary text-on-primary text-[9px] px-1 rounded-full ml-0.5">
                {planAnnotations.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Main content */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="max-w-3xl mx-auto">
            {/* Summary */}
            <div className="mb-4 p-3 bg-surface-elevated rounded-lg border border-border">
              <p className="text-[12px] text-text-secondary">{activePlan.summary}</p>
            </div>

            {showDiff && previousVersion ? (
              <PlanDiffView
                oldMarkdown={previousVersion.markdown}
                newMarkdown={activePlan.markdown}
              />
            ) : (
              <div
                ref={blocksContainerRef}
                className="flex flex-col gap-1"
                onMouseUp={handleBlocksMouseUp}
              >
                {activePlan.blocks.map((block) => (
                  <React.Fragment key={block.id}>
                    <PlanBlockView
                      block={block}
                      annotations={planAnnotations.filter(a => a.blockId === block.id)}
                    />
                    {annotatingType && selectionBlockId === block.id && (
                      <AnnotationForm
                        type={annotatingType}
                        originalText={selectedText}
                        onSubmit={handleAnnotationSubmit}
                        onCancel={() => setAnnotatingType(null)}
                      />
                    )}
                  </React.Fragment>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Annotation sidebar */}
        {showSidebar && (
          <div className="w-64 border-l border-border bg-surface overflow-hidden flex-shrink-0">
            <AnnotationSidebar
              annotations={planAnnotations}
              blocks={activePlan.blocks}
              onRemove={removePlanAnnotation}
            />
          </div>
        )}
      </div>

      {/* Toolbar (rendered at container level for cross-block selection support) */}
      {showToolbar && (
        <AnnotationToolbar
          position={toolbarPos}
          onAction={handleAnnotationAction}
          onClose={() => {
            setShowToolbar(false);
            window.getSelection()?.removeAllRanges();
          }}
        />
      )}

      {/* Actions */}
      <PlanActions
        annotationCount={planAnnotations.length}
        onApprove={handleApprove}
        onRevise={handleRevise}
      />
    </div>
  );
};
