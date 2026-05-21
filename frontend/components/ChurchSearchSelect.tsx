import React, { useMemo, useState } from 'react';

export type ChurchOption = { id: number; name: string };

type Props = {
  churches: ChurchOption[];
  value: string;
  onChange: (churchId: string) => void;
  required?: boolean;
  placeholder?: string;
};

export default function ChurchSearchSelect({
  churches,
  value,
  onChange,
  required,
  placeholder = 'Selecione sua igreja',
}: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const selected = churches.find(c => String(c.id) === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return churches;
    return churches.filter(c => c.name.toLowerCase().includes(q));
  }, [churches, query]);

  const pick = (id: number) => {
    onChange(String(id));
    setQuery('');
    setOpen(false);
  };

  const inputValue = open ? query : selected?.name ?? query;

  return (
    <div className="relative">
      <label className="block text-xs font-semibold text-gray-400 uppercase mb-1">
        Igreja {required ? '*' : ''}
      </label>
      <input
        type="search"
        autoComplete="off"
        placeholder={selected ? selected.name : 'Pesquisar igreja...'}
        className="w-full px-3 py-2 border border-gray-600 bg-gray-700 text-white rounded focus:ring-blue-500 focus:border-blue-500 cursor-text"
        value={inputValue}
        onChange={e => {
          const next = e.target.value;
          setQuery(next);
          setOpen(true);
          if (value && next !== selected?.name) onChange('');
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
      {open && (
        <ul
          className="absolute z-20 mt-1 w-full max-h-48 overflow-y-auto bg-gray-900 border border-gray-600 rounded-lg shadow-xl"
          role="listbox"
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-gray-500">Nenhuma igreja encontrada</li>
          ) : (
            filtered.map(c => (
              <li key={c.id}>
                <button
                  type="button"
                  className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => pick(c.id)}
                >
                  {c.name}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
      {required && !value && !open && (
        <p className="text-xs text-gray-500 mt-1">{placeholder}</p>
      )}
    </div>
  );
}
