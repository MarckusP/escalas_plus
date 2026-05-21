import React, { useMemo, useState } from 'react';

export type SearchableOption = { id: number | string; label: string };

type Props = {
  label?: string;
  options: SearchableOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
};

export default function SearchableSelect({
  label,
  options,
  value,
  onChange,
  placeholder = 'Selecione...',
  required,
  disabled,
}: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const selected = options.find(o => String(o.id) === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(o => o.label.toLowerCase().includes(q));
  }, [options, query]);

  const pick = (id: number | string) => {
    onChange(String(id));
    setQuery('');
    setOpen(false);
  };

  const inputValue = open ? query : selected?.label ?? query;

  return (
    <div className="relative">
      {label && (
        <label className="block text-xs font-semibold text-gray-400 uppercase mb-1">
          {label} {required ? '*' : ''}
        </label>
      )}
      <input
        type="search"
        disabled={disabled}
        autoComplete="off"
        placeholder={selected ? selected.label : placeholder}
        className="w-full px-3 py-2 border border-gray-600 bg-gray-700 text-white rounded text-sm disabled:opacity-50 cursor-text"
        value={inputValue}
        onChange={e => {
          const next = e.target.value;
          setQuery(next);
          setOpen(true);
          if (value && next !== selected?.label) onChange('');
        }}
        onFocus={() => {
          setOpen(true);
          if (selected && !query) setQuery('');
        }}
        onBlur={() => {
          setTimeout(() => {
            setOpen(false);
            setQuery('');
          }, 150);
        }}
      />
      {open && !disabled && (
        <ul className="absolute z-30 mt-1 w-full max-h-48 overflow-y-auto bg-gray-900 border border-gray-600 rounded-lg shadow-xl">
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-gray-500">Nenhum resultado</li>
          ) : (
            filtered.map(o => (
              <li key={String(o.id)}>
                <button
                  type="button"
                  className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => pick(o.id)}
                >
                  {o.label}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
      {!value && required && !open && (
        <p className="text-xs text-gray-500 mt-1">{placeholder}</p>
      )}
    </div>
  );
}
