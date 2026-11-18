import { forwardRef, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent, type ReactNode } from 'react';
import { cx } from '../../preview/lib/cx';

import { LOOSE_TOKEN, PLACEHOLDER_MIME, TOKEN, drag, humanizeKey, labelMap, type PlaceholderDef } from '../lib/placeholders';

function chipNode(key: string, labels: Map<string, string>): HTMLSpanElement {
  const known = labels.has(key);
  const el = document.createElement('span');
  el.className = known ? 'sa-ph' : 'sa-ph sa-ph--unknown';
  el.contentEditable = 'false';
  el.draggable = true;
  el.dataset.ph = key;
  el.textContent = labels.get(key) ?? humanizeKey(key);
  el.title = known ? 'Filled in automatically. Drag to move it, or Backspace to remove it.' : `"${key}" is not a supported placeholder, so it will not be filled in.`;
  return el;
}

function render(root: HTMLElement, value: string, labels: Map<string, string>) {
  root.replaceChildren();
  let last = 0;
  for (const m of value.matchAll(TOKEN)) {
    const at = m.index ?? 0;
    if (at > last) root.append(document.createTextNode(value.slice(last, at)));
    root.append(chipNode(m[1], labels));
    last = at + m[0].length;
  }
  if (last < value.length) root.append(document.createTextNode(value.slice(last)));
}

/** Back to template text: boxes become `{{key}}`, line breaks (a <br>, or a block the browser made on Enter) become "\n". */
function serialize(node: Node): string {
  let out = '';
  node.childNodes.forEach((n) => {
    if (n.nodeType === Node.TEXT_NODE) { out += (n.textContent ?? '').replace(/ /g, ' '); return; }   // the browser types some spaces as non-breaking
    if (!(n instanceof HTMLElement)) return;
    if (n.dataset.ph) out += `{{${n.dataset.ph}}}`;
    else if (n.tagName === 'BR') out += '\n';
    else {
      const block = n.tagName === 'DIV' || n.tagName === 'P';
      if (block && out && !out.endsWith('\n')) out += '\n';
      out += serialize(n);
    }
  });
  return out;
}

function rangeAtPoint(x: number, y: number): Range | null {
  const doc = document as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null };
  if (typeof document.caretRangeFromPoint === 'function') return document.caretRangeFromPoint(x, y);
  const pos = doc.caretPositionFromPoint?.(x, y);
  if (!pos) return null;
  const r = document.createRange();
  r.setStart(pos.offsetNode, pos.offset);
  r.collapse(true);
  return r;
}

export interface PlaceholderEditorHandle { insert(key: string): void; focus(): void }

/**
 * A text box whose placeholders are labeled boxes. Drag a box in from the list (or click one there to put it at the cursor), drag
 * boxes around inside the text, Backspace removes one. `single` is a one-line field (the subject): Enter does nothing there.
 */
export const PlaceholderEditor = forwardRef<PlaceholderEditorHandle, {
  value: string;
  onChange: (value: string) => void;
  placeholders: PlaceholderDef[];
  single?: boolean;
  onFocus?: () => void;
  className?: string;
  id?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
  'aria-label'?: string;
}>(function PlaceholderEditor({ value, onChange, placeholders, single = false, onFocus, className, ...aria }, ref) {
  const root = useRef<HTMLDivElement>(null);
  const shown = useRef<string | null>(null);            // the text the DOM currently shows (what was last rendered or emitted)
  const saved = useRef<Range | null>(null);             // where the cursor was, for "click a box to insert"
  const [over, setOver] = useState(false);
  const labels = useMemo(() => labelMap(placeholders), [placeholders]);

  // Render from `value` only when it changed from outside (the first time, a reset, labels arriving); never while typing.
  useLayoutEffect(() => {
    if (root.current && value !== shown.current) { render(root.current, value, labels); shown.current = value; }
  }, [value, labels]);
  useLayoutEffect(() => { if (root.current && shown.current !== null) render(root.current, shown.current, labels); }, [labels]);

  const emit = () => {
    if (!root.current) return;
    const next = serialize(root.current);
    shown.current = next;
    onChange(next);
  };

  const remember = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount && root.current?.contains(sel.anchorNode)) saved.current = sel.getRangeAt(0).cloneRange();
  };

  const placeAfter = (node: Node) => {
    const r = document.createRange();
    r.setStartAfter(node);
    r.collapse(true);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(r);
    saved.current = r.cloneRange();
  };

  /** A range inside the editor's own text: never inside a box (it goes after it), else the end of the text. */
  const usable = (r: Range | null): Range => {
    const el = root.current!;
    if (r && el.contains(r.startContainer)) {
      const inChip = (r.startContainer instanceof HTMLElement ? r.startContainer : r.startContainer.parentElement)?.closest('.sa-ph');
      if (inChip && el.contains(inChip)) { const after = document.createRange(); after.setStartAfter(inChip); after.collapse(true); return after; }
      return r;
    }
    const end = document.createRange();
    end.selectNodeContents(el);
    end.collapse(false);
    return end;
  };

  const insertAt = (r: Range, key: string) => {
    const chip = chipNode(key, labels);
    r.deleteContents();
    r.insertNode(chip);
    placeAfter(chip);
    emit();
  };

  useImperativeHandle(ref, () => ({
    insert(key: string) {
      root.current?.focus();
      insertAt(usable(saved.current), key);
    },
    focus() { root.current?.focus(); },
  }));

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (!single) document.execCommand('insertLineBreak');
  };

  const onPaste = (e: ClipboardEvent) => {
    e.preventDefault();
    let text = e.clipboardData.getData('text/plain');
    if (single) text = text.replace(/\s*\n\s*/g, ' ');
    document.execCommand('insertText', false, text);
  };

  // Typed or pasted `{{key}}` text becomes a box when the field loses focus (doing it while typing would move the cursor).
  const onBlur = () => {
    if (!root.current) return;
    const text = serialize(root.current);
    const hasLooseToken = Array.from(root.current.childNodes).some((n) => n.nodeType === Node.TEXT_NODE && LOOSE_TOKEN.test(n.textContent ?? ''));
    if (hasLooseToken) { render(root.current, text, labels); shown.current = text; }
  };

  const onDragStart = (e: DragEvent) => {
    const chip = (e.target as HTMLElement).closest?.('.sa-ph') as HTMLElement | null;
    if (!chip?.dataset.ph) return;
    drag.chip = chip;
    chip.classList.add('sa-ph--dragging');
    e.dataTransfer.setData(PLACEHOLDER_MIME, chip.dataset.ph);
    e.dataTransfer.setData('text/plain', `{{${chip.dataset.ph}}}`);
    e.dataTransfer.effectAllowed = 'copyMove';
  };
  const onDragEnd = () => { drag.chip?.classList.remove('sa-ph--dragging'); drag.chip = null; };

  const onDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = drag.chip ? 'move' : 'copy';
    if (!over) setOver(true);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const key = e.dataTransfer.getData(PLACEHOLDER_MIME);
    const r = usable(rangeAtPoint(e.clientX, e.clientY));
    if (key) {
      const moving = drag.chip;
      if (moving && (moving === r.startContainer || moving.contains(r.startContainer))) return;   // dropped onto itself
      const chip = chipNode(key, labels);
      r.insertNode(chip);
      if (moving) { const from = moving.closest('[data-ph-editor]'); moving.remove(); drag.chip = null; if (from && from !== root.current) from.dispatchEvent(new Event('input', { bubbles: true })); }
      placeAfter(chip);
      emit();
      return;
    }
    // Anything else dropped in is taken as plain text (never as formatted HTML).
    const text = e.dataTransfer.getData('text/plain');
    if (!text) return;
    const node = document.createTextNode(single ? text.replace(/\s*\n\s*/g, ' ') : text);
    r.insertNode(node);
    placeAfter(node);
    emit();
  };

  return (
    <div
      ref={root}
      {...aria}
      data-ph-editor=""
      role="textbox"
      aria-multiline={!single}
      contentEditable
      suppressContentEditableWarning
      spellCheck
      className={cx('sa-input sa-phedit', single && 'sa-phedit--single', over && 'sa-phedit--over', className)}
      onInput={emit}
      onKeyDown={onKeyDown}
      onKeyUp={remember}
      onMouseUp={remember}
      onFocus={onFocus}
      onBlur={() => { remember(); onBlur(); }}
      onPaste={onPaste}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    />
  );
});

/** Read-only template text with its placeholders shown as labeled boxes (template lists, subjects). */
export function PlaceholderText({ text, placeholders }: { text: string; placeholders: PlaceholderDef[] }): ReactNode {
  const labels = labelMap(placeholders);
  const parts: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    const at = m.index ?? 0;
    if (at > last) parts.push(text.slice(last, at));
    parts.push(<span key={at} className={cx('sa-ph sa-ph--static', !labels.has(m[1]) && 'sa-ph--unknown')}>{labels.get(m[1]) ?? humanizeKey(m[1])}</span>);
    last = at + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}
