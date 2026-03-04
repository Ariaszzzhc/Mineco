import React, { useState, useMemo } from 'react';
import { Copy, Check } from 'lucide-react';
import hljs from 'highlight.js';
import 'highlight.js/styles/github-dark.css';
import 'katex/dist/katex.min.css';
import { useTranslation } from '../i18n';

// Code block component with copy button and syntax highlighting
interface CodeBlockProps {
  filename?: string;
  code: string;
  language?: string;
}

export const CodeBlock: React.FC<CodeBlockProps> = ({ filename, code, language }) => {
  const [copied, setCopied] = useState(false);
  const t = useTranslation();

  const highlightedCode = useMemo(() => {
    if (language && hljs.getLanguage(language)) {
      try {
        return hljs.highlight(code, { language }).value;
      } catch {
        // Fall back to auto-detection
      }
    }
    try {
      return hljs.highlightAuto(code).value;
    } catch {
      return code;
    }
  }, [code, language]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group/code my-4">
      {/* Floating actions */}
      <div className="absolute top-3 right-3 flex items-center z-10">
        <div className="transition-opacity duration-200 group-hover/code:opacity-0 flex items-center">
          {(filename || language) && (
            <span className="text-text-secondary/50 text-[11px] font-mono lowercase tracking-wider select-none">
              {filename || language}
            </span>
          )}
        </div>

        <button
          onClick={handleCopy}
          className={`absolute right-0 text-[11px] px-2.5 py-1.5 rounded-md flex items-center gap-1.5 transition-all duration-200 backdrop-blur-md bg-surface/90 border border-border/50 shadow-sm ${
            copied
              ? 'text-success border-success/30 opacity-100 translate-y-0'
              : 'text-text-secondary hover:text-text-primary opacity-0 translate-y-1 group-hover/code:opacity-100 group-hover/code:translate-y-0'
          }`}
        >
          {copied ? <Check size={13} strokeWidth={2} /> : <Copy size={13} strokeWidth={1.5} />}
          {copied ? t['message.copied'] : t['message.copy']}
        </button>
      </div>

      <div className="bg-code-bg border border-code-border rounded-lg overflow-hidden font-mono text-[13px] leading-relaxed">
        {/* Code content */}
        <div className="p-4 pt-5 overflow-x-auto">
          <pre className="!bg-transparent !border-none !p-0 !m-0">
            <code
              className={language ? `language-${language}` : ''}
              dangerouslySetInnerHTML={{ __html: highlightedCode }}
            />
          </pre>
        </div>
      </div>
    </div>
  );
};
