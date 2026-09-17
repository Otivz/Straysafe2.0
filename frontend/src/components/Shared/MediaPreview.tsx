import { getMediaKind } from '../../utils/uploadValidation';

interface MediaPreviewProps {
    url: string;
    className?: string;
    alt?: string;
}

// Renders an attachment URL as the right element for its type: <img> for
// images, a playable <video> for videos, and a plain link for documents
// (PDF/DOC/DOCX) since those can't be inlined as media.
const MediaPreview = ({ url, className, alt = 'attachment' }: MediaPreviewProps) => {
    const kind = getMediaKind(url);

    if (kind === 'video') {
        return (
            <video
                src={url}
                controls
                className={className}
                preload="metadata"
            />
        );
    }

    if (kind === 'document') {
        return (
            <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className={`flex items-center gap-2 text-xs font-bold text-[#F97316] hover:underline ${className || ''}`}
            >
                <span>📄</span>
                <span>View document</span>
            </a>
        );
    }

    return <img src={url} alt={alt} className={className} />;
};

export default MediaPreview;
