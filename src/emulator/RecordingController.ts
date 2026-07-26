/**
 * Screen and audio capture.
 *
 * The previous implementation recorded video only, so every clip came out
 * silent. Here the canvas stream is merged with a tap from the audio graph
 * before recording.
 */

export interface RecordingOptions {
    fps?: number;
    videoBitsPerSecond?: number;
    audioStream?: MediaStream | null;
}

/** Ordered by preference; the first supported type wins. */
const MIME_CANDIDATES = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4',
];

export class RecordingController {
    private recorder: MediaRecorder | null = null;
    private chunks: Blob[] = [];
    private stream: MediaStream | null = null;
    private canvasStream: MediaStream | null = null;
    private recording = false;
    private startedAt = 0;
    private mimeType = 'video/webm';

    public get isRecording(): boolean {
        return this.recording;
    }

    public get elapsedMs(): number {
        return this.recording ? Date.now() - this.startedAt : 0;
    }

    public get fileExtension(): string {
        return this.mimeType.startsWith('video/mp4') ? 'mp4' : 'webm';
    }

    public static isSupported(): boolean {
        return typeof MediaRecorder !== 'undefined' && MIME_CANDIDATES.some((t) => MediaRecorder.isTypeSupported(t));
    }

    public start(canvas: HTMLCanvasElement, options: RecordingOptions = {}): boolean {
        if (this.recording) return false;
        if (!RecordingController.isSupported()) return false;

        const { fps = 60, videoBitsPerSecond = 8_000_000, audioStream = null } = options;

        try {
            this.canvasStream = canvas.captureStream(fps);
            const tracks = [...this.canvasStream.getVideoTracks()];
            if (audioStream) tracks.push(...audioStream.getAudioTracks());
            this.stream = new MediaStream(tracks);

            this.mimeType = MIME_CANDIDATES.find((t) => MediaRecorder.isTypeSupported(t)) ?? 'video/webm';

            this.recorder = new MediaRecorder(this.stream, {
                mimeType: this.mimeType,
                videoBitsPerSecond,
                audioBitsPerSecond: 128_000,
            });

            this.chunks = [];
            this.recorder.ondataavailable = (e) => {
                if (e.data.size > 0) this.chunks.push(e.data);
            };
            // A 1s timeslice keeps memory bounded on long captures without the
            // per-100ms chunk overhead the old code paid.
            this.recorder.start(1000);
            this.recording = true;
            this.startedAt = Date.now();
            return true;
        } catch (e) {
            console.error('Recording failed to start:', e);
            this.cleanup();
            return false;
        }
    }

    public stop(): Promise<Blob | null> {
        return new Promise((resolve) => {
            if (!this.recorder || !this.recording) {
                resolve(null);
                return;
            }
            this.recorder.onstop = () => {
                const blob = this.chunks.length > 0 ? new Blob(this.chunks, { type: this.mimeType }) : null;
                this.chunks = [];
                this.cleanup();
                resolve(blob);
            };
            try {
                this.recorder.stop();
            } catch {
                this.cleanup();
                resolve(null);
            }
        });
    }

    private cleanup(): void {
        this.recording = false;
        // Stop only the canvas tracks — the audio track belongs to the engine
        // and must keep playing after the recording ends.
        this.canvasStream?.getTracks().forEach((t) => t.stop());
        this.canvasStream = null;
        this.stream = null;
        this.recorder = null;
    }
}

export function downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    downloadUrl(url, filename);
    // Revoke on the next task so the navigation has definitely started.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function downloadUrl(url: string, filename: string): void {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
}

export function downloadBytes(bytes: Uint8Array, filename: string, type = 'application/octet-stream'): void {
    downloadBlob(new Blob([bytes as BlobPart], { type }), filename);
}

/** Copy a canvas to the clipboard as a PNG, where the browser allows it. */
export async function copyCanvasToClipboard(canvas: HTMLCanvasElement): Promise<boolean> {
    if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') return false;
    try {
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
        if (!blob) return false;
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        return true;
    } catch {
        return false;
    }
}

/** Filename-safe slug with a sortable timestamp. */
export function captureFilename(base: string, extension: string): string {
    const slug = base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'nes';
    const now = new Date();
    const stamp = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0'),
        '-',
        String(now.getHours()).padStart(2, '0'),
        String(now.getMinutes()).padStart(2, '0'),
        String(now.getSeconds()).padStart(2, '0'),
    ].join('');
    return `${slug}-${stamp}.${extension}`;
}
