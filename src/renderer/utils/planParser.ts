import type { PlanBlock, PlanAnnotation } from '../../shared/types';

export function parsePlanBlocks(markdown: string): PlanBlock[] {
  const lines = markdown.split('\n');
  const blocks: PlanBlock[] = [];
  let blockId = 0;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.match(/^#{1,6}\s/)) {
      const match = line.match(/^(#{1,6})\s/);
      const level = match ? match[1].length : 1;
      blocks.push({
        id: `block-${blockId++}`,
        type: 'heading',
        content: line,
        order: blocks.length,
        lineStart: i,
        lineEnd: i,
        level,
      });
      i++;
    } else if (line.startsWith('```')) {
      const start = i;
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        i++;
      }
      if (i < lines.length) i++;
      blocks.push({
        id: `block-${blockId++}`,
        type: 'code',
        content: lines.slice(start, i).join('\n'),
        order: blocks.length,
        lineStart: start,
        lineEnd: i - 1,
      });
    } else if (line.startsWith('>')) {
      const start = i;
      while (i < lines.length && lines[i].startsWith('>')) {
        i++;
      }
      blocks.push({
        id: `block-${blockId++}`,
        type: 'blockquote',
        content: lines.slice(start, i).join('\n'),
        order: blocks.length,
        lineStart: start,
        lineEnd: i - 1,
      });
    } else if (line.match(/^[\s]*[-*+]\s/) || line.match(/^[\s]*\d+\.\s/)) {
      blocks.push({
        id: `block-${blockId++}`,
        type: 'list-item',
        content: line,
        order: blocks.length,
        lineStart: i,
        lineEnd: i,
      });
      i++;
    } else if (line.trim() === '') {
      i++;
    } else {
      const start = i;
      while (
        i < lines.length &&
        lines[i].trim() !== '' &&
        !lines[i].match(/^#{1,6}\s/) &&
        !lines[i].startsWith('```') &&
        !lines[i].startsWith('>') &&
        !lines[i].match(/^[\s]*[-*+]\s/) &&
        !lines[i].match(/^[\s]*\d+\.\s/)
      ) {
        i++;
      }
      blocks.push({
        id: `block-${blockId++}`,
        type: 'paragraph',
        content: lines.slice(start, i).join('\n'),
        order: blocks.length,
        lineStart: start,
        lineEnd: i - 1,
      });
    }
  }

  return blocks;
}

export function serializeAnnotations(annotations: PlanAnnotation[]): string {
  return annotations.map((a) => {
    const prefix = `[${a.type.toUpperCase()}]`;
    const excerpt = a.originalText.length > 60
      ? a.originalText.slice(0, 60) + '...'
      : a.originalText;

    switch (a.type) {
      case 'delete':
        return `${prefix} Remove: "${excerpt}"`;
      case 'insert':
        return `${prefix} After "${excerpt}", insert: "${a.newText || ''}"`;
      case 'replace':
        return `${prefix} Replace "${excerpt}" with: "${a.newText || ''}"`;
      case 'comment':
        return `${prefix} On "${excerpt}": ${a.comment || ''}`;
      default:
        return `${prefix} ${excerpt}`;
    }
  }).join('\n');
}
