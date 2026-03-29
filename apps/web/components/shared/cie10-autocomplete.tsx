'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';

interface Cie10Result {
  code: string;
  description: string;
}

interface Props {
  value: string;           // "J06.9 - Infección aguda de vías respiratorias" or ""
  onChange: (code: string, description: string) => void;
  inputClass?: string;
  required?: boolean;
  placeholder?: string;
}

export function Cie10Autocomplete({ value, onChange, inputClass = '', required, placeholder }: Props) {
  const supabase = createClient();
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<Cie10Result[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedRef = useRef(false);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function handleInput(q: string) {
    setQuery(q);
    selectedRef.current = false;
    onChange('', q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.trim().length < 2) { setResults([]); setOpen(false); return; }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      const term = q.trim().toUpperCase();
      const { data } = await supabase
        .from('cie10_codes')
        .select('code, description')
        .or(`code.ilike.${term}%,description.ilike.%${q.trim()}%`)
        .order('code')
        .limit(10);
      setResults(data ?? []);
      setOpen(true);
      setLoading(false);
    }, 300);
  }

  function select(r: Cie10Result) {
    const label = `${r.code} - ${r.description}`;
    setQuery(label);
    onChange(r.code, r.description);
    selectedRef.current = true;
    setOpen(false);
    setResults([]);
  }

  return (
    <div className="relative" ref={containerRef}>
      <input
        type="text"
        value={query}
        onChange={(e) => handleInput(e.target.value)}
        onFocus={() => { if (results.length > 0) setOpen(true); }}
        placeholder={placeholder ?? 'Buscar por código (J06) o descripción...'}
        className={inputClass}
        autoComplete="off"
        required={required}
      />
      {loading && (
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">...</span>
      )}
      {open && results.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
          {results.map((r) => (
            <button
              key={r.code}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); select(r); }}
              className="w-full text-left px-3 py-2 hover:bg-blue-50 text-sm flex gap-2 items-baseline"
            >
              <span className="font-mono font-bold text-primary shrink-0">{r.code}</span>
              <span className="text-gray-700 truncate">{r.description}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
