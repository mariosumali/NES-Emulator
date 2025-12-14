export class AudioController {
    private context: AudioContext | null = null;
    private processor: ScriptProcessorNode | null = null;
    private bufferSize = 8192; // Higher latency but safer for JS emulation
    private buffer: number[] = [];
    private bufferLimit = 8192 * 2; // Limit buffer size to avoid growing indefinitely

    constructor() { }

    public async start() {
        if (this.context) return;

        const AudioContextClass = (window.AudioContext || (window as any).webkitAudioContext);
        this.context = new AudioContextClass();

        // Create a ScriptProcessorNode with a buffer size of 4096 and a single input and output channel
        this.processor = this.context.createScriptProcessor(4096, 0, 2);

        this.processor.onaudioprocess = this.onAudioProcess.bind(this);
        this.processor.connect(this.context.destination);
    }

    public stop() {
        if (this.processor) {
            this.processor.disconnect();
            this.processor = null;
        }
        if (this.context) {
            this.context.close();
            this.context = null;
        }
        this.buffer = [];
    }

    // Called by the emulator core
    public writeSample(left: number, right: number) {
        if (this.buffer.length > this.bufferLimit) {
            // Drop samples if we are too far ahead to avoid latency drift
            return;
        }
        this.buffer.push(left, right);
    }

    private onAudioProcess(e: AudioProcessingEvent) {
        const left = e.outputBuffer.getChannelData(0);
        const right = e.outputBuffer.getChannelData(1);
        const samples = left.length; // usually 4096

        // Read from our internal buffer
        for (let i = 0; i < samples; i++) {
            if (this.buffer.length > 2) {
                left[i] = this.buffer.shift()!;
                right[i] = this.buffer.shift()!;
            } else {
                // Underrun: silence
                left[i] = 0;
                right[i] = 0;
            }
        }
    }
}
