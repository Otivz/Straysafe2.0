import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';

export interface ResidentOption { id: string; name: string; unit: string; street?: string }

/**
 * Type a resident's name (or their unit or street) to find them, or open the list and choose. Used where the Leader picks one resident
 * account: filing a report for someone (New Report) and naming the confirmed owner (case Assessment).
 * `noneLabel` adds a first "nobody" choice (value ''); leave it out when a resident must be chosen.
 */
export function ResidentCombobox({
  residents,
  value,
  onChange,
  label = 'Registered resident',
  placeholder = 'Type a name, or choose…',
  noneLabel,
  invalid,
}: {
  residents: ResidentOption[];
  value: string;
  onChange: (id: string) => void;
  label?: string;
  placeholder?: string;
  noneLabel?: string;
  invalid?: boolean;
}) {
  const selected = residents.find((r) => r.id === value) ?? null;
  const formatLabel = (r: { name: string; unit: string }) =>
    `${r.name}${r.unit && r.unit !== 'Address not recorded' ? ` · ${r.unit}` : ''}`;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  const needle = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!needle) return residents;
    return residents.filter((r) => [r.name, r.unit, r.street ?? ''].some((t) => t.toLowerCase().includes(needle)));
  }, [residents, needle]);

  const items: { id: string; label: string; sub?: string }[] = useMemo(() => {
    const list: { id: string; label: string; sub?: string }[] = [];
    if (noneLabel && (!needle || noneLabel.toLowerCase().includes(needle))) list.push({ id: '', label: noneLabel });
    for (const r of filtered) {
      list.push({ id: r.id, label: r.name, sub: r.unit && r.unit !== 'Address not recorded' ? r.unit : undefined });
    }
    return list;
  }, [filtered, needle, noneLabel]);

  const pick = (id: string) => {
    onChange(id);
    setQuery('');
    setOpen(false);
  };

  const displayValue = open ? query : selected ? formatLabel(selected) : '';

  return (
    <div ref={rootRef} className="relative">
      <div className="relative flex items-center">
        <Search size={15} className="pointer-events-none absolute left-3 text-[var(--sa-ink-3)]" aria-hidden="true" />
        <input
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-label={label}
          aria-invalid={invalid || undefined}
          autoComplete="off"
          className="sa-input w-full pl-9 pr-14"
          placeholder={selected ? formatLabel(selected) : placeholder}
          value={displayValue}
          onFocus={() => {
            setQuery('');
            setActiveIndex(0);
            setOpen(true);
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(0);
            if (!open) setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setOpen(true);
              setActiveIndex((i) => Math.min(items.length - 1, i + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActiveIndex((i) => Math.max(0, i - 1));
            } else if (e.key === 'Enter' && open) {
              e.preventDefault();
              const item = items[activeIndex];
              if (item) pick(item.id);
            } else if (e.key === 'Escape') {
              setOpen(false);
              setQuery('');
            }
          }}
        />
        <div className="absolute right-2 flex items-center gap-0.5">
          {value || query ? (
            <button
              type="button"
              aria-label={`Clear ${label.toLowerCase()}`}
              onClick={() => pick('')}
              className="rounded p-1 text-[var(--sa-ink-3)] hover:bg-[var(--sa-sand)] hover:text-[var(--sa-ink)]"
            >
              <X size={14} />
            </button>
          ) : null}
          <button
            type="button"
            aria-label="Show the resident list"
            onClick={() => setOpen((o) => !o)}
            className="rounded p-1 text-[var(--sa-ink-3)] hover:bg-[var(--sa-sand)] hover:text-[var(--sa-ink)]"
          >
            <ChevronDown size={15} className={`transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {open ? (
        <ul
          role="listbox"
          className="absolute left-0 right-0 top-full z-30 mt-1.5 max-h-60 overflow-y-auto rounded-[var(--sa-radius)] border border-[#e7e2da] bg-white p-1 shadow-lg"
        >
          {items.length === 0 ? (
            <li className="px-3 py-2 text-[13px] text-[var(--sa-ink-3)]">No matching residents found.</li>
          ) : (
            items.map((item, idx) => {
              const isSelected = item.id === value;
              const isActive = idx === activeIndex;
              return (
                <li key={item.id || '__none__'} role="option" aria-selected={isSelected}>
                  <button
                    type="button"
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => pick(item.id)}
                    className={`flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-[13.5px] transition-colors ${
                      isActive ? 'bg-[#fbf6ee] text-[var(--sa-ink)]' : 'text-[var(--sa-ink-2)] hover:bg-[#fbf6ee]'
                    }`}
                  >
                    <span className="truncate">
                      <span className={isSelected ? 'font-semibold text-[var(--sa-ink)]' : 'font-medium'}>{item.label}</span>
                      {item.sub ? <span className="text-[var(--sa-ink-3)]"> · {item.sub}</span> : null}
                    </span>
                    {isSelected ? <Check size={14} className="shrink-0 text-[var(--sa-brand)]" /> : null}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      ) : null}
    </div>
  );
}
