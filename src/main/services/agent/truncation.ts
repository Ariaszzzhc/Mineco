import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '../logger';

const log = createLogger('Truncation');

const MAX_LINES = 2000;
const MAX_BYTES = 50 * 1024;
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

type TruncateResult =
  | { content: string; truncated: false }
  | { content: string; truncated: true; outputPath: string };

export async function truncateToolOutput(
  result: unknown,
  workingDir: string,
): Promise<TruncateResult> {
  const text = typeof result === 'string' ? result : JSON.stringify(result);
  const byteLength = Buffer.byteLength(text, 'utf-8');

  if (byteLength <= MAX_BYTES) {
    const lineCount = text.split('\n').length;
    if (lineCount <= MAX_LINES) {
      return { content: text, truncated: false };
    }
  }

  const lines = text.split('\n');
  let truncated: string;
  if (lines.length > MAX_LINES) {
    truncated = lines.slice(0, MAX_LINES).join('\n');
  } else {
    truncated = text;
  }

  if (Buffer.byteLength(truncated, 'utf-8') > MAX_BYTES) {
    const buf = Buffer.from(truncated, 'utf-8');
    truncated = buf.subarray(0, MAX_BYTES).toString('utf-8');
  }

  const outputDir = path.join(workingDir, '.manong', 'tool-output');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const timestamp = Date.now();
  const outputPath = path.join(outputDir, `output_${timestamp}.txt`);
  fs.writeFileSync(outputPath, text, 'utf-8');

  const totalLines = lines.length;
  const truncatedLines = truncated.split('\n').length;
  const omitted = totalLines - truncatedLines;

  const content = `<preview>\n${truncated}\n</preview>\n\n...${omitted} lines truncated...\n\nFull output saved to: ${outputPath}\nUse read_file with offset/limit to view specific sections, or grep to search the full content.`;

  log.info(`Truncated tool output: ${totalLines} lines / ${byteLength} bytes -> ${truncatedLines} lines, saved to ${outputPath}`);

  return { content, truncated: true, outputPath };
}

export async function cleanupToolOutputs(workingDir: string): Promise<void> {
  const outputDir = path.join(workingDir, '.manong', 'tool-output');
  if (!fs.existsSync(outputDir)) return;

  const now = Date.now();
  const entries = fs.readdirSync(outputDir);

  for (const entry of entries) {
    const filePath = path.join(outputDir, entry);
    try {
      const stat = fs.statSync(filePath);
      if (now - stat.mtimeMs > RETENTION_MS) {
        fs.unlinkSync(filePath);
        log.info(`Cleaned up old tool output: ${entry}`);
      }
    } catch {
      // ignore
    }
  }
}
