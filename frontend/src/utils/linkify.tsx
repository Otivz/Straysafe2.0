import type { ReactNode } from 'react';

// Web links inside chat text (e.g. a meeting link from the Barangay) become bold, underlined, clickable links that
// open in a new tab. Only http(s) and www. links are linked; anything else stays plain text.
const URL_RE = /((?:https?:\/\/|www\.)[^\s<>"']+)/gi;
const TRAILING = /[.,;:!?)\]]+$/;   // "see https://x.y/z." -> the period isn't part of the link

export function linkify(text: string | null | undefined): ReactNode {
    if (!text) return text ?? null;
    const parts = text.split(URL_RE);
    if (parts.length === 1) return text;
    return parts.map((part, i) => {
        if (i % 2 === 0) return part;                     // odd indexes are the captured links
        const trail = part.match(TRAILING)?.[0] ?? '';
        const url = trail ? part.slice(0, -trail.length) : part;
        const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
        return (
            <span key={i}>
                <a href={href} target="_blank" rel="noopener noreferrer"
                    className="font-black underline underline-offset-2 break-all hover:opacity-80"
                    onClick={(e) => e.stopPropagation()}>
                    {url}
                </a>
                {trail}
            </span>
        );
    });
}
