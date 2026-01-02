export class RecordingController {
    private mediaRecorder: MediaRecorder | null = null;
    private chunks: Blob[] = [];
    private stream: MediaStream | null = null;
    private isRecording = false;

    constructor() { }

    public startRecording(canvas: HTMLCanvasElement): boolean {
        if (this.isRecording) return false;

        try {
            // Capture stream from canvas at 60fps
            this.stream = canvas.captureStream(60);

            // Try to use WebM with VP9, fallback to VP8
            const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
                ? 'video/webm;codecs=vp9'
                : 'video/webm;codecs=vp8';

            this.mediaRecorder = new MediaRecorder(this.stream, {
                mimeType,
                videoBitsPerSecond: 5000000 // 5 Mbps
            });

            this.chunks = [];

            this.mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    this.chunks.push(e.data);
                }
            };

            this.mediaRecorder.start(100); // Collect data every 100ms
            this.isRecording = true;
            return true;
        } catch (e) {
            console.error('Failed to start recording:', e);
            return false;
        }
    }

    public stopRecording(): Promise<Blob | null> {
        return new Promise((resolve) => {
            if (!this.mediaRecorder || !this.isRecording) {
                resolve(null);
                return;
            }

            this.mediaRecorder.onstop = () => {
                const blob = new Blob(this.chunks, { type: 'video/webm' });
                this.chunks = [];
                this.isRecording = false;

                if (this.stream) {
                    this.stream.getTracks().forEach(track => track.stop());
                    this.stream = null;
                }

                resolve(blob);
            };

            this.mediaRecorder.stop();
        });
    }

    public getIsRecording(): boolean {
        return this.isRecording;
    }

    public static downloadBlob(blob: Blob, filename: string): void {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    public static takeScreenshot(canvas: HTMLCanvasElement): string {
        return canvas.toDataURL('image/png');
    }

    public static downloadScreenshot(canvas: HTMLCanvasElement, filename: string): void {
        const dataUrl = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }
}
