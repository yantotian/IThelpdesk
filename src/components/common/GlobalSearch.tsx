import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Ticket, User, Tag, X, Loader2 } from 'lucide-react';
import { globalSearch, type SearchResult } from '@/lib/api';

const TYPE_ICON: Record<SearchResult['type'], React.ReactNode> = {
  ticket:   <Ticket className="w-3.5 h-3.5 text-primary shrink-0" />,
  user:     <User className="w-3.5 h-3.5 text-blue-400 shrink-0" />,
  category: <Tag className="w-3.5 h-3.5 text-green-400 shrink-0" />,
};

const TYPE_LABEL: Record<SearchResult['type'], string> = {
  ticket:   'TICKET',
  user:     'USER',
  category: 'CATEGORY',
};

export default function GlobalSearch() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Ctrl+K / Cmd+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(o => !o);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
      setResults([]);
    }
  }, [open]);

  // Debounced search
  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      const r = await globalSearch(q);
      setResults(r);
      setActiveIdx(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(query), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, doSearch]);

  // Outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleSelect = (r: SearchResult) => {
    navigate(r.path);
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, results.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
    if (e.key === 'Enter' && results[activeIdx]) handleSelect(results[activeIdx]);
  };

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(true)}
        className="hidden md:flex items-center gap-2 border border-border bg-secondary px-3 h-8 text-muted-foreground hover:text-foreground hover:border-primary transition-colors"
        title="Global search (Ctrl+K)"
      >
        <Search className="w-3 h-3" />
        <span className="mono text-xs">Search...</span>
        <span className="mono text-[10px] border border-border px-1.5 py-0.5 ml-1">⌘K</span>
      </button>

      {/* Mobile icon-only trigger */}
      <button
        onClick={() => setOpen(true)}
        className="md:hidden flex items-center justify-center w-8 h-8 border border-border text-muted-foreground hover:text-primary hover:border-primary transition-colors shrink-0"
      >
        <Search className="w-4 h-4" />
      </button>

      {/* Overlay */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4 bg-background/80 backdrop-blur-sm">
          <div ref={containerRef} className="w-full max-w-lg border border-border bg-card shadow-2xl">
            {/* Input row */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
              <Search className="w-4 h-4 text-muted-foreground shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search tickets, users, categories..."
                className="flex-1 bg-transparent mono text-sm text-foreground placeholder:text-muted-foreground outline-none"
              />
              {loading && <Loader2 className="w-3.5 h-3.5 text-muted-foreground animate-spin shrink-0" />}
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Results */}
            <div className="max-h-80 overflow-y-auto">
              {query.length > 0 && query.length < 2 ? (
                <p className="px-4 py-4 mono text-xs text-muted-foreground text-center">Type at least 2 characters...</p>
              ) : results.length === 0 && !loading && query.length >= 2 ? (
                <p className="px-4 py-6 mono text-xs text-muted-foreground text-center">No results for "{query}"</p>
              ) : results.length === 0 && !query ? (
                <div className="px-4 py-6 text-center">
                  <p className="mono text-xs text-muted-foreground mb-2">Search across tickets, users, and categories</p>
                  <p className="mono text-[10px] text-muted-foreground/60">Use ↑ ↓ to navigate · Enter to open · Esc to close</p>
                </div>
              ) : results.map((r, i) => (
                <button
                  key={r.id + r.type}
                  onClick={() => handleSelect(r)}
                  className={`w-full text-left flex items-center gap-3 px-4 py-2.5 border-b border-border/40 transition-colors ${
                    i === activeIdx ? 'bg-primary/10' : 'hover:bg-secondary/60'
                  }`}
                >
                  {TYPE_ICON[r.type]}
                  <div className="flex-1 min-w-0">
                    <span className="mono text-xs text-foreground truncate block">{r.label}</span>
                    <span className="mono text-[10px] text-muted-foreground truncate block">{r.sub}</span>
                  </div>
                  <span className="mono text-[9px] border border-border px-1.5 py-0.5 text-muted-foreground shrink-0">
                    {TYPE_LABEL[r.type]}
                  </span>
                </button>
              ))}
            </div>

            {results.length > 0 && (
              <div className="px-4 py-2 border-t border-border">
                <p className="mono text-[10px] text-muted-foreground">{results.length} result{results.length !== 1 ? 's' : ''}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
