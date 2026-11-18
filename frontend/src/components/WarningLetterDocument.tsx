import { useEffect, useRef, useState } from 'react';
import '../styles/warningLetter.css';
import { bodyBlocks } from './warningLetterBlocks';

const A4_WIDTH_PX = 794;

export interface WarningLetterDocumentProps {
  subdivisionName?: string | null;
  subdivisionAddress?: string | null;
  subdivisionPhone?: string | null;
  subdivisionEmail?: string | null;
  warningLevel: string;
  warningReference: string;
  caseReference: string;
  issueDate: string;
  recipientName: string;
  recipientAddress?: string | null;
  subject: string;
  body: string;
  issuerName: string;
  issuerRole?: string | null;
  /**
   * A draft (prepared, or a preview): not an issued letter. It shows "DRAFT — NOT OFFICIALLY ISSUED" across the page and on top
   * (on every printed page) and no warning reference. Only an issued letter is shown without it.
   */
  draft?: boolean;
  /** An issued letter from before the layout marker (API `legacy_layout`): its old header/recipient/signature lines are hidden. */
  legacyLayout?: boolean;
}

const DRAFT_MARK = 'DRAFT — NOT OFFICIALLY ISSUED';

function splitIssuer(nameOrCombined: string, roleHint?: string | null): { name: string; role: string } {
  const raw = (nameOrCombined || 'Subdivision Leader').trim();
  if (roleHint?.trim()) {
    const suffix = `(${roleHint.trim()})`;
    const cleanName = raw.endsWith(suffix) ? raw.slice(0, -suffix.length).trim() : raw;
    return { name: cleanName || raw, role: roleHint.trim() };
  }
  const match = /^(.*)\(([^)]+)\)$/.exec(raw);
  if (match) {
    return { name: match[1].trim() || raw, role: match[2].trim() || 'Subdivision Leader' };
  }
  return { name: raw, role: 'Subdivision Leader' };
}

/**
 * Formal A4 Official Warning Letter document preview.
 * Maintains exact A4 proportions across viewports by proportionally scaling the 794px canvas on narrow screens.
 */
export function WarningLetterDocument(props: WarningLetterDocumentProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const paperRef = useRef<HTMLElement | null>(null);
  const [scale, setScale] = useState(1);
  const [paperHeight, setPaperHeight] = useState(1123);

  useEffect(() => {
    const vp = viewportRef.current;
    const paper = paperRef.current;
    if (!vp || !paper) return;

    const update = () => {
      const style = window.getComputedStyle(vp);
      const padX = parseFloat(style.paddingLeft || '0') + parseFloat(style.paddingRight || '0');
      const avail = Math.max(240, vp.clientWidth - padX);
      setScale(Math.min(1, avail / A4_WIDTH_PX));
      setPaperHeight(paper.offsetHeight || 1123);
    };

    update();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(update);
    ro.observe(vp);
    ro.observe(paper);
    return () => ro.disconnect();
  }, [props.body, props.subject, props.recipientAddress, props.warningReference]);

  const subName = (props.subdivisionName || '').trim() || 'Subdivision Office';
  const contactLine = [props.subdivisionPhone, props.subdivisionEmail].map((x) => (x || '').trim()).filter(Boolean).join(' · ');
  const { name: issuerName, role: issuerRole } = splitIssuer(props.issuerName, props.issuerRole);
  const blocks = bodyBlocks(props.body, props.subject, !!props.legacyLayout);

  const scaledW = Math.round(A4_WIDTH_PX * scale);
  const scaledH = Math.round(paperHeight * scale);

  return (
    <div ref={viewportRef} className="ss-a4-viewport">
      <div className="ss-a4-scale-box" style={{ width: `${scaledW}px`, height: `${scaledH}px` }}>
        <article
          ref={paperRef}
          className={props.draft ? 'ss-a4-paper ss-a4-paper--draft' : 'ss-a4-paper'}
          style={scale < 1 ? { transform: `scale(${scale})` } : undefined}
          aria-label={props.draft ? 'Draft warning letter, not officially issued' : 'Official Warning Letter'}
        >
          {props.draft ? (
            <>
              <div className="ss-a4-draft-banner" role="note">{DRAFT_MARK} · no warning reference · not sent to the resident</div>
              <div className="ss-a4-draft-watermark" aria-hidden="true"><span>{DRAFT_MARK}</span></div>
            </>
          ) : null}
          {/* Letterhead */}
          <header className="ss-a4-letterhead">
            <h2 className="ss-a4-letterhead__org">{subName}</h2>
            <p className="ss-a4-letterhead__office">Office of the Subdivision Leader</p>
            {props.subdivisionAddress?.trim() ? (
              <p className="ss-a4-letterhead__contact">{props.subdivisionAddress.trim()}</p>
            ) : null}
            {contactLine ? <p className="ss-a4-letterhead__contact">{contactLine}</p> : null}
          </header>

          {/* Warning Document Header */}
          <section className="ss-a4-docheader">
            <h3 className="ss-a4-docheader__title">PET POLICY VIOLATION NOTICE</h3>
            <p className="ss-a4-docheader__level">{props.warningLevel}</p>
            <div className="ss-a4-meta">
              <div className="ss-a4-meta__item">
                <span className="ss-a4-meta__label">Warning Reference</span>
                <span className="ss-a4-meta__value">{props.draft ? 'None (draft)' : props.warningReference}</span>
              </div>
              <div className="ss-a4-meta__item">
                <span className="ss-a4-meta__label">Case Reference</span>
                <span className="ss-a4-meta__value">{props.caseReference}</span>
              </div>
              <div className="ss-a4-meta__item">
                <span className="ss-a4-meta__label">Date Issued</span>
                <span className="ss-a4-meta__value">{props.issueDate}</span>
              </div>
            </div>
          </section>

          {/* Recipient Information */}
          <section className="ss-a4-recipient">
            <p className="ss-a4-recipient__row">
              <span className="ss-a4-recipient__label">TO:</span>
              <span className="ss-a4-recipient__name">{props.recipientName}</span>
            </p>
            {props.recipientAddress?.trim() ? (
              <p className="ss-a4-recipient__row">
                <span className="ss-a4-recipient__label">Address:</span>
                <span className="ss-a4-recipient__address">{props.recipientAddress.trim()}</span>
              </p>
            ) : null}
          </section>

          {/* Letter Body */}
          <section className="ss-a4-body">
            {blocks.map((b, idx) => {
              if (b.kind === 'subject') {
                return (
                  <p key={idx} className="ss-a4-subject">
                    <strong>SUBJECT:</strong> {b.text}
                  </p>
                );
              }
              if (b.kind === 'section') {
                return (
                  <div key={idx} className="ss-a4-section">
                    <h4 className="ss-a4-section__heading">{b.heading}</h4>
                    {b.text ? <p className="ss-a4-para">{b.text}</p> : null}
                  </div>
                );
              }
              return (
                <p key={idx} className="ss-a4-para">
                  {b.text}
                </p>
              );
            })}
          </section>

          {/* Issuing Authority / Signature */}
          <footer className="ss-a4-signature">
            <p className="ss-a4-signature__label">Issued by:</p>
            <div className="ss-a4-signature__space" aria-hidden="true" />
            <p className="ss-a4-signature__name">{issuerName}</p>
            <p className="ss-a4-signature__role">{issuerRole}</p>
            <p className="ss-a4-signature__role">{subName}</p>
          </footer>
        </article>
      </div>
    </div>
  );
}
