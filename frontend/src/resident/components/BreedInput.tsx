import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from 'react';
import { Check, ChevronDown, Sparkles } from 'lucide-react';
import { cx } from '../../preview/lib/cx';
import { filterBreedSuggestions } from '../data/breeds';

export interface BreedInputProps {
  id?: string;
  value?: string;
  onChange?: (value: string) => void;
  animalType?: string | null;
  placeholder?: string;
  maxLength?: number;
  disabled?: boolean;
  className?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}

/**
 * Breed combobox and autocomplete input:
 * - Allows typing any custom breed name freely.
 * - Shows an interactive dropdown with popular breeds filtered by animal type (e.g. Dog vs Cat).
 * - Supports keyboard navigation (ArrowUp, ArrowDown, Enter, Escape).
 * - Click or tap on any suggested breed automatically populates the input.
 */
export function BreedInput({
  id: propId,
  value = '',
  onChange,
  animalType,
  placeholder = 'e.g. Aspin, Shih Tzu, Puspin',
  maxLength = 60,
  disabled = false,
  className,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
}: BreedInputProps) {
  const autoId = useId();
  const id = propId || autoId;
  const listId = `${id}-breed-list`;

  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const suggestions = filterBreedSuggestions(animalType, value);
  const trimmed = value.trim();
  const hasExactMatch = suggestions.some(
    (s) => s.toLowerCase() === trimmed.toLowerCase()
  );

  // Close dropdown on outside click
  useEffect(() => {
    function handlePointerDown(e: MouseEvent | TouchEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        setActiveIndex(-1);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handlePointerDown);
      document.addEventListener('touchstart', handlePointerDown);
      return () => {
        document.removeEventListener('mousedown', handlePointerDown);
        document.removeEventListener('touchstart', handlePointerDown);
      };
    }
  }, [open]);

  // Keep active option visible in scrollable menu
  useEffect(() => {
    if (open && activeIndex >= 0 && menuRef.current) {
      const activeEl = menuRef.current.children[activeIndex] as HTMLElement | undefined;
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [activeIndex, open]);

  const selectBreed = (breed: string) => {
    onChange?.(breed);
    setOpen(false);
    setActiveIndex(-1);
    inputRef.current?.focus();
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    onChange?.(e.target.value);
    if (!open) setOpen(true);
    setActiveIndex(-1);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        setActiveIndex(0);
      } else if (suggestions.length > 0) {
        setActiveIndex((prev) => (prev + 1) % suggestions.length);
      }
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        setActiveIndex(suggestions.length - 1);
      } else if (suggestions.length > 0) {
        setActiveIndex((prev) => (prev <= 0 ? suggestions.length - 1 : prev - 1));
      }
      return;
    }

    if (e.key === 'Enter') {
      if (open && activeIndex >= 0 && activeIndex < suggestions.length) {
        e.preventDefault();
        e.stopPropagation();
        selectBreed(suggestions[activeIndex]);
        return;
      }
      // If menu was open, Enter closes it without preventing form submission if already typed
      if (open) {
        setOpen(false);
        setActiveIndex(-1);
      }
      return;
    }

    if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        setOpen(false);
        setActiveIndex(-1);
      }
    }
  };

  return (
    <div
      ref={wrapperRef}
      className={cx('rs-breed-combobox', className)}
    >
      <div className="rs-breed-combobox__control">
        <input
          ref={inputRef}
          id={id}
          type="text"
          className="rs-input"
          value={value}
          onChange={handleInputChange}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          maxLength={maxLength}
          disabled={disabled}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-invalid={ariaInvalid}
          aria-describedby={ariaDescribedBy}
        />
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          className="rs-breed-combobox__toggle"
          aria-label={open ? 'Close breed suggestions' : 'Open breed suggestions'}
          onClick={() => {
            setOpen((prev) => !prev);
            inputRef.current?.focus();
          }}
        >
          <ChevronDown
            size={18}
            aria-hidden="true"
            className={cx('transition-transform duration-150', open && 'rotate-180')}
          />
        </button>
      </div>

      {open && (
        <div
          id={listId}
          ref={menuRef}
          className="rs-breed-combobox__menu"
          role="listbox"
          aria-label="Suggested breeds"
        >
          {suggestions.length > 0 ? (
            <>
              <div className="rs-breed-combobox__header">
                {animalType
                  ? `Popular ${animalType.replace('_', ' ')} breeds`
                  : 'Common breeds'}
              </div>

              {suggestions.map((breed, idx) => {
                const isSelected = breed.toLowerCase() === trimmed.toLowerCase();
                const isActive = idx === activeIndex;

                return (
                  <button
                    key={breed}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={cx(
                      'rs-breed-combobox__item',
                      isActive && 'is-active',
                      isSelected && 'is-selected'
                    )}
                    onMouseDown={(e) => {
                      // Prevent input blur before click registers
                      e.preventDefault();
                    }}
                    onClick={() => selectBreed(breed)}
                  >
                    <span>{breed}</span>
                    {isSelected ? (
                      <Check size={16} aria-hidden="true" className="text-[var(--sa-brand)]" />
                    ) : null}
                  </button>
                );
              })}

              {trimmed && !hasExactMatch ? (
                <div className="rs-breed-combobox__custom">
                  <Sparkles size={14} aria-hidden="true" />
                  <span>Custom breed: <strong>&ldquo;{trimmed}&rdquo;</strong> will be saved</span>
                </div>
              ) : null}
            </>
          ) : (
            <div className="rs-breed-combobox__empty">
              <span>No predefined breed matches &ldquo;{trimmed}&rdquo;.</span>
              <p className="mt-1 text-xs text-[var(--sa-ink-3)]">
                You can keep typing your custom breed.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
