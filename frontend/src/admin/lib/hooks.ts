import { useEffect } from 'react';

/** Sets the tab title for the page and restores the previous one on leave. */
export function usePageTitle(title: string): void {
  useEffect(() => {
    const previous = document.title;
    document.title = `${title} · StraySafe Admin`;
    return () => { document.title = previous; };
  }, [title]);
}
