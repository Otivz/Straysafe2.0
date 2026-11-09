import type { ReactNode } from 'react';
import { residentPath } from '../config';
import { useBack, usePageTitle } from '../lib/hooks';
import { TopBar } from './Chrome';

/**
 * A pushed (secondary) screen: Back, a title, the content and an optional sticky action bar.
 * `back` is where Back goes when there is no previous screen in this tab (a deep link or a reload).
 */
export function Screen({ title, subtitle, back = '/home', onBack, actions, footer, children }: {
  title: string;
  subtitle?: string;
  back?: string;
  onBack?: () => void;
  actions?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  usePageTitle(title);
  const goBack = useBack(residentPath(back));
  return (
    <>
      <TopBar title={title} subtitle={subtitle} onBack={onBack ?? goBack} actions={actions} />
      <div className="rs-content">{children}</div>
      {footer ? <div className="rs-actionbar">{footer}</div> : null}
    </>
  );
}

/** A top-level screen reached from the bottom navigation: no Back, a large heading and an optional action. */
export function PrimaryScreen({ title, docTitle, lead, actions, children }: { title: string; docTitle?: string; lead?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  usePageTitle(docTitle ?? title);
  return (
    <>
      <header className="rs-primaryhead">
        <div className="min-w-0">
          <h1 className="rs-title">{title}</h1>
          {lead ? <p className="rs-sub">{lead}</p> : null}
        </div>
        {actions}
      </header>
      <div className="rs-content">{children}</div>
    </>
  );
}
