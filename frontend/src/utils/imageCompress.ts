// Shrink large phone photos in the browser before upload (most cameras produce 4-15 MB JPEGs, and the
// server accepts at most 10 MB per photo). Small images are returned unchanged.

const MAX_SIDE = 1920;
const TARGET_BYTES = 2 * 1024 * 1024;

export async function compressImageFile(file: File): Promise<File> {
    if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
    if (file.size <= TARGET_BYTES) return file;
    try {
        const bitmap = await createImageBitmap(file);
        const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(bitmap.width * scale);
        canvas.height = Math.round(bitmap.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) return file;
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close?.();
        const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
        if (!blob || blob.size >= file.size) return file;
        const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
        return new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() });
    } catch {
        return file; // unsupported format in this browser: let the server validate it
    }
}

export const compressImageFiles = (files: File[]) => Promise.all(files.map(compressImageFile));
