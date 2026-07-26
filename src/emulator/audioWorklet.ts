/**
 * Source for the AudioWorkletProcessor, kept as a string and loaded from a Blob
 * URL.
 *
 * A worklet module has to be fetched by URL, and bundling it as a separate entry
 * point complicates the build and breaks offline/PWA use. Inlining it here keeps
 * the whole emulator in one bundle with no network dependency at runtime.
 *
 * The processor owns a single-producer/single-consumer ring buffer. The main
 * thread posts interleaved stereo chunks; `process()` drains 128 frames at a
 * time on the audio thread. On underrun it decays the last sample toward silence
 * instead of hard-cutting to zero, which is the difference between a soft dip
 * and an audible click.
 */

export const AUDIO_WORKLET_SOURCE = /* js */ `
class NesAudioProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const capacityFrames = (options.processorOptions && options.processorOptions.capacityFrames) || 8192;
    this.capacity = capacityFrames;
    this.ring = new Float32Array(capacityFrames * 2);
    this.readIndex = 0;
    this.writeIndex = 0;
    this.available = 0;
    this.lastL = 0;
    this.lastR = 0;
    this.underrunFrames = 0;
    this.reportCounter = 0;
    this.running = true;

    this.port.onmessage = (event) => {
      const msg = event.data;
      if (msg.type === 'samples') {
        this.push(msg.data);
      } else if (msg.type === 'flush') {
        this.readIndex = 0;
        this.writeIndex = 0;
        this.available = 0;
        this.lastL = 0;
        this.lastR = 0;
      } else if (msg.type === 'stop') {
        this.running = false;
      }
    };
  }

  push(chunk) {
    const frames = chunk.length >> 1;
    // If the producer has run ahead, drop the oldest audio rather than the
    // newest: latency stays bounded and the game stays in sync with the picture.
    const overflow = this.available + frames - this.capacity;
    if (overflow > 0) {
      this.readIndex = (this.readIndex + overflow) % this.capacity;
      this.available -= overflow;
    }
    for (let i = 0; i < frames; i++) {
      const w = ((this.writeIndex + i) % this.capacity) * 2;
      this.ring[w] = chunk[i * 2];
      this.ring[w + 1] = chunk[i * 2 + 1];
    }
    this.writeIndex = (this.writeIndex + frames) % this.capacity;
    this.available += frames;
  }

  process(_inputs, outputs) {
    const output = outputs[0];
    if (!output || output.length === 0) return this.running;

    const left = output[0];
    const right = output.length > 1 ? output[1] : output[0];
    const frames = left.length;

    for (let i = 0; i < frames; i++) {
      if (this.available > 0) {
        const r = this.readIndex * 2;
        this.lastL = this.ring[r];
        this.lastR = this.ring[r + 1];
        this.readIndex = (this.readIndex + 1) % this.capacity;
        this.available--;
      } else {
        // Underrun: glide to silence over ~2ms rather than snapping to it.
        this.lastL *= 0.985;
        this.lastR *= 0.985;
        this.underrunFrames++;
      }
      left[i] = this.lastL;
      right[i] = this.lastR;
    }

    // Report the fill level a few times per second so the emulation loop can
    // pace itself against the audio clock instead of the display refresh rate.
    if (++this.reportCounter >= 8) {
      this.reportCounter = 0;
      this.port.postMessage({
        type: 'level',
        available: this.available,
        capacity: this.capacity,
        underrunFrames: this.underrunFrames,
      });
      this.underrunFrames = 0;
    }

    return this.running;
  }
}

registerProcessor('nes-audio', NesAudioProcessor);
`;
