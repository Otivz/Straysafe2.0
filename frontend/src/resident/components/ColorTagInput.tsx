import { useId, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { Plus, X } from 'lucide-react';
import { cx } from '../../preview/lib/cx';
import { addColorTags, cleanColorTag, filterColorSuggestions, removeColorTag } from '../data/colors';

export interface ColorTagInputProps {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  invalid?: boolean;
  disabled?: boolean;
  maxTags?: number;
  label?: string;
}

/**
 * Dynamic Colour or Coat tag input:
 * - Enter or comma turns typed text into a compact rounded chip (`[White ×]`).
 * - Backspace with an empty input removes the last tag.
 * - Live autocomplete dropdown suggests predefined colours while allowing any custom colour.
 * - Mobile-friendly: supports comma auto-commit on soft keyboards plus a tap-to-add `+` action.
 */
export function ColorTagInput({
  value,
  onChange,
  placeholder = 'Type a colour (e.g. White) and press Enter',
  invalid = false,
  disabled = false,
  maxTags = 10,
  label = 'Colour or coat',
}: ColorTagInputProps) {
  const inputId = useId();
  const listId = `${inputId}-suggestions`;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const suggestions = filterColorSuggestions(value, text);
  const atLimit = value.length >= maxTags;
  const trimmed = cleanColorTag(text);
  const showMenu = open && trimmed.length > 0 && suggestions.length > 0 && !atLimit && !disabled;
  const exactInValue = trimmed ? value.some((c) => c.toLowerCase() === trimmed.toLowerCase()) : false;

  const commitText = (raw: string) => {
    if (disabled || atLimit) return;
    const next = addColorTags(value, raw).slice(0, maxTags);
    onChange(next);
    setText('');
    setOpen(false);
    setActiveIndex(-1);
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const nextRaw = e.target.value;
    // Support soft/mobile keyboards that insert a trailing comma or pasted comma list
    if (nextRaw.includes(',') || nextRaw.includes(';')) {
      const segments = nextRaw.split(/[,;]/);
      const completed = segments.slice(0, -1).join(',');
      const tail = segments[segments.length - 1] ?? '';
      if (completed.trim()) {
        onChange(addColorTags(value, completed).slice(0, maxTags));
      }
      setText(tail);
      setOpen(cleanColorTag(tail).length > 0);
      setActiveIndex(-1);
      return;
    }
    setText(nextRaw);
    setOpen(cleanColorTag(nextRaw).length > 0);
    setActiveIndex(-1);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;
    if (e.key === 'Enter' || e.key === ',') {
      if (showMenu && activeIndex >= 0 && activeIndex < suggestions.length) {
        e.preventDefault();
        e.stopPropagation();
        commitText(suggestions[activeIndex]);
        return;
      }
      if (trimmed) {
        e.preventDefault();
        e.stopPropagation();
        commitText(trimmed);
      } else if (e.key === ',') {
        e.preventDefault();
      }
      return;
    }
    if (e.key === 'Backspace' && text === '' && value.length > 0) {
      e.preventDefault();
      onChange(removeColorTag(value, value.length - 1));
      return;
    }
    if (e.key === 'ArrowDown' && suggestions.length > 0 && trimmed.length > 0) {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((idx) => (idx + 1) % suggestions.length);
      return;
    }
    if (e.key === 'ArrowUp' && suggestions.length > 0 && trimmed.length > 0) {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((idx) => (idx <= 0 ? suggestions.length - 1 : idx - 1));
      return;
    }
    if (e.key === 'Escape') {
      setOpen(false);
      setActiveIndex(-1);
    }
  };

  const pickSuggestion = (color: string) => {
    commitText(color);
    inputRef.current?.focus();
  };

  return (
    <div className="rs-color-input">
      <div
        className={cx('rs-tagbox', open && 'is-focused')}
        aria-invalid={invalid || undefined}
        onClick={() => inputRef.current?.focus()}
      >
        {value.length > 0 ? (
          <div className="rs-tagbox__chips" role="list" aria-label={`Selected ${label.toLowerCase()} tags`}>
            {value.map((tag, idx) => (
              <span key={tag.toLowerCase()} className="rs-color-chip" role="listitem">
                <span>{tag}</span>
                {!disabled ? (
                  <button
                    type="button"
                    className="rs-color-chip__remove"
                    aria-label={`Remove ${tag}`}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      onChange(removeColorTag(value, idx));
                      inputRef.current?.focus();
                    }}
                  >
                    <X size={13} aria-hidden="true" />
                  </button>
                ) : null}
              </span>
            ))}
          </div>
        ) : null}

        {!atLimit ? (
          <div className="rs-tagbox__entry">
            <input
              ref={inputRef}
              id={inputId}
              type="text"
              className="rs-tagbox__input"
              value={text}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              onFocus={() => setOpen(true)}
              onBlur={() => {
                if (trimmed && !atLimit) {
                  commitText(trimmed);
                }
                setOpen(false);
                setActiveIndex(-1);
              }}
              placeholder={value.length > 0 ? 'Add another colour…' : placeholder}
              aria-label={label}
              aria-autocomplete="list"
              aria-expanded={showMenu}
              aria-controls={listId}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="words"
              enterKeyHint="done"
              disabled={disabled}
              maxLength={40}
            />
            {trimmed && !exactInValue ? (
              <button
                type="button"
                className="rs-tagbox__add"
                onMouseDown={(ev) => ev.preventDefault()}
                onClick={() => {
                  commitText(trimmed);
                  inputRef.current?.focus();
                }}
              >
                <Plus size={14} aria-hidden="true" />
                Add
              </button>
            ) : null}
          </div>
        ) : (
          <p className="rs-hint" style={{ margin: '4px 0 0' }}>Maximum of {maxTags} colours added.</p>
        )}
      </div>

      {showMenu ? (
        <div
          id={listId}
          className="rs-tagbox__menu"
          role="listbox"
          aria-label="Colour suggestions"
          onMouseDown={(ev) => ev.preventDefault()}
        >
          {suggestions.map((suggestion, idx) => (
            <button
              key={suggestion}
              type="button"
              role="option"
              aria-selected={idx === activeIndex}
              className={cx('rs-tagbox__option', idx === activeIndex && 'is-active')}
              onClick={() => pickSuggestion(suggestion)}
            >
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
