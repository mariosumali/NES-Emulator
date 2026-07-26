import { SCREEN_HEIGHT, SCREEN_WIDTH } from './NesCore';
import { FRAGMENT_SHADER, VERTEX_SHADER } from './shaders';
import type { VideoFilter } from '../storage/settings';

/**
 * Frame presentation.
 *
 * Prefers WebGL2 so the CRT shader is available; falls back to Canvas2D with
 * CSS-based scanlines when WebGL is unavailable (locked-down browsers, some
 * virtualised GPUs). Both paths share the same `drawFrame(buffer)` entry point.
 *
 * The 8 scanlines at the top and bottom of a NES frame were hidden behind the
 * bezel on a real TV and are frequently full of garbage; `overscan` crops them.
 */

export interface FilterParams {
    curvature: number;
    scanline: number;
    mask: number;
    bloom: number;
    vignette: number;
    smooth: number;
    brightness: number;
    saturation: number;
    aberration: number;
}

export const FILTER_PRESETS: Record<VideoFilter, FilterParams> = {
    sharp: {
        curvature: 0, scanline: 0, mask: 0, bloom: 0, vignette: 0,
        smooth: 0, brightness: 1, saturation: 1, aberration: 0,
    },
    smooth: {
        curvature: 0, scanline: 0, mask: 0, bloom: 0.1, vignette: 0,
        smooth: 1, brightness: 1, saturation: 1, aberration: 0,
    },
    scanlines: {
        curvature: 0, scanline: 0.45, mask: 0, bloom: 0.12, vignette: 0.15,
        smooth: 0, brightness: 1.02, saturation: 1.05, aberration: 0,
    },
    crt: {
        curvature: 0.22, scanline: 0.4, mask: 0.32, bloom: 0.4, vignette: 0.4,
        smooth: 0.25, brightness: 1.06, saturation: 1.12, aberration: 0.5,
    },
    phosphor: {
        curvature: 0, scanline: 0.28, mask: 0.5, bloom: 0.55, vignette: 0.22,
        smooth: 0.4, brightness: 1.08, saturation: 1.2, aberration: 0,
    },
};

const OVERSCAN_TOP = 8;
const OVERSCAN_BOTTOM = 8;

export class Renderer {
    private canvas: HTMLCanvasElement;
    private gl: WebGL2RenderingContext | null = null;
    private ctx2d: CanvasRenderingContext2D | null = null;

    private program: WebGLProgram | null = null;
    private texture: WebGLTexture | null = null;
    private uniforms: Record<string, WebGLUniformLocation | null> = {};

    /** RGBA staging buffer for the full 256x240 frame. */
    private pixels = new Uint8Array(SCREEN_WIDTH * SCREEN_HEIGHT * 4);
    private pixels32 = new Uint32Array(this.pixels.buffer);

    /** 2D fallback state. */
    private imageData: ImageData | null = null;
    private imageData32: Uint32Array | null = null;
    private fallbackCanvas: HTMLCanvasElement | null = null;
    private fallbackCtx: CanvasRenderingContext2D | null = null;

    /** Tiny downsample used for the ambient glow behind the screen. */
    private glowCanvas: HTMLCanvasElement;
    private glowCtx: CanvasRenderingContext2D | null;
    private glowCounter = 0;

    private params: FilterParams = FILTER_PRESETS.crt;
    private overscan = false;
    private lastBuffer: number[] | null = null;
    private disposed = false;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;

        this.glowCanvas = document.createElement('canvas');
        this.glowCanvas.width = 12;
        this.glowCanvas.height = 12;
        this.glowCtx = this.glowCanvas.getContext('2d', { willReadFrequently: false });

        if (!this.initGl()) this.init2d();
    }

    public get isWebGl(): boolean {
        return this.gl !== null;
    }

    /* ------------------------------------------------------- setup -- */

    private initGl(): boolean {
        const gl = this.canvas.getContext('webgl2', {
            alpha: false,
            antialias: false,
            depth: false,
            stencil: false,
            // Screenshots read back the drawing buffer outside the draw call.
            preserveDrawingBuffer: true,
            powerPreference: 'low-power',
            desynchronized: true,
        });
        if (!gl) return false;

        const program = this.compile(gl, VERTEX_SHADER, FRAGMENT_SHADER);
        if (!program) return false;

        this.gl = gl;
        this.program = program;
        gl.useProgram(program);

        for (const name of [
            'uTex', 'uTexSize', 'uOutSize', 'uCurvature', 'uScanline', 'uMask',
            'uBloom', 'uVignette', 'uSmooth', 'uBrightness', 'uSaturation', 'uAberration',
        ]) {
            this.uniforms[name] = gl.getUniformLocation(program, name);
        }

        this.texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(
            gl.TEXTURE_2D, 0, gl.RGBA, SCREEN_WIDTH, SCREEN_HEIGHT, 0,
            gl.RGBA, gl.UNSIGNED_BYTE, null
        );
        gl.uniform1i(this.uniforms.uTex, 0);
        gl.activeTexture(gl.TEXTURE0);

        // A vertex array is mandatory in WebGL2 even when the vertex shader
        // synthesises its positions from gl_VertexID.
        gl.bindVertexArray(gl.createVertexArray());
        gl.clearColor(0, 0, 0, 1);
        return true;
    }

    private compile(gl: WebGL2RenderingContext, vsSource: string, fsSource: string): WebGLProgram | null {
        const make = (type: number, source: string) => {
            const shader = gl.createShader(type);
            if (!shader) return null;
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                console.error('Shader compile failed:', gl.getShaderInfoLog(shader));
                gl.deleteShader(shader);
                return null;
            }
            return shader;
        };

        const vs = make(gl.VERTEX_SHADER, vsSource);
        const fs = make(gl.FRAGMENT_SHADER, fsSource);
        if (!vs || !fs) return null;

        const program = gl.createProgram();
        if (!program) return null;
        gl.attachShader(program, vs);
        gl.attachShader(program, fs);
        gl.linkProgram(program);
        gl.deleteShader(vs);
        gl.deleteShader(fs);

        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.error('Program link failed:', gl.getProgramInfoLog(program));
            return null;
        }
        return program;
    }

    private init2d(): boolean {
        this.ctx2d = this.canvas.getContext('2d', { alpha: false, desynchronized: true });
        if (!this.ctx2d) return false;
        this.ctx2d.imageSmoothingEnabled = false;

        // Frames are composed at native resolution then blitted up, so the
        // browser does the scaling on the GPU rather than us doing it per pixel.
        this.fallbackCanvas = document.createElement('canvas');
        this.fallbackCanvas.width = SCREEN_WIDTH;
        this.fallbackCanvas.height = SCREEN_HEIGHT;
        this.fallbackCtx = this.fallbackCanvas.getContext('2d', { alpha: false });
        if (!this.fallbackCtx) return false;

        this.imageData = this.fallbackCtx.createImageData(SCREEN_WIDTH, SCREEN_HEIGHT);
        this.imageData32 = new Uint32Array(this.imageData.data.buffer);
        return true;
    }

    /* ------------------------------------------------------ config -- */

    public setFilter(filter: VideoFilter, overrides?: Partial<FilterParams>): void {
        this.params = { ...FILTER_PRESETS[filter], ...overrides };
    }

    public setOverscan(enabled: boolean): void {
        this.overscan = enabled;
    }

    /** Resize the drawing buffer to match the element's device-pixel size. */
    public resize(cssWidth: number, cssHeight: number, dpr = window.devicePixelRatio || 1): void {
        const width = Math.max(1, Math.round(cssWidth * dpr));
        const height = Math.max(1, Math.round(cssHeight * dpr));
        if (this.canvas.width === width && this.canvas.height === height) return;
        this.canvas.width = width;
        this.canvas.height = height;
        this.gl?.viewport(0, 0, width, height);
        if (this.ctx2d) this.ctx2d.imageSmoothingEnabled = this.params.smooth > 0.5;
        if (this.lastBuffer) this.drawFrame(this.lastBuffer);
    }

    /* ------------------------------------------------------- draw -- */

    /**
     * `buffer` holds 0x00BBGGRR words — jsnes packs its palette that way, which
     * happens to be exactly the byte order a little-endian Uint32 write into
     * RGBA image data needs. We only add the alpha byte.
     */
    public drawFrame(buffer: number[]): void {
        if (this.disposed) return;
        this.lastBuffer = buffer;

        const target = this.gl ? this.pixels32 : this.imageData32;
        if (!target) return;

        const count = SCREEN_WIDTH * SCREEN_HEIGHT;
        for (let i = 0; i < count; i++) {
            target[i] = 0xff000000 | buffer[i];
        }

        if (this.gl) this.drawGl();
        else this.draw2d();

        // The glow only needs to track the picture loosely; every 6th frame is
        // imperceptible and keeps this off the hot path.
        if (++this.glowCounter >= 6) {
            this.glowCounter = 0;
            this.updateGlow();
        }
    }

    private get cropTop(): number {
        return this.overscan ? OVERSCAN_TOP : 0;
    }

    private get cropHeight(): number {
        return this.overscan ? SCREEN_HEIGHT - OVERSCAN_TOP - OVERSCAN_BOTTOM : SCREEN_HEIGHT;
    }

    private drawGl(): void {
        const gl = this.gl;
        if (!gl || !this.program) return;

        const top = this.cropTop;
        const height = this.cropHeight;

        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        if (this.overscan) {
            const offset = top * SCREEN_WIDTH * 4;
            gl.texImage2D(
                gl.TEXTURE_2D, 0, gl.RGBA, SCREEN_WIDTH, height, 0,
                gl.RGBA, gl.UNSIGNED_BYTE,
                this.pixels.subarray(offset, offset + SCREEN_WIDTH * height * 4)
            );
        } else {
            gl.texSubImage2D(
                gl.TEXTURE_2D, 0, 0, 0, SCREEN_WIDTH, SCREEN_HEIGHT,
                gl.RGBA, gl.UNSIGNED_BYTE, this.pixels
            );
        }

        const p = this.params;
        gl.uniform2f(this.uniforms.uTexSize, SCREEN_WIDTH, height);
        gl.uniform2f(this.uniforms.uOutSize, this.canvas.width, this.canvas.height);
        gl.uniform1f(this.uniforms.uCurvature, p.curvature);
        gl.uniform1f(this.uniforms.uScanline, p.scanline);
        gl.uniform1f(this.uniforms.uMask, p.mask);
        gl.uniform1f(this.uniforms.uBloom, p.bloom);
        gl.uniform1f(this.uniforms.uVignette, p.vignette);
        gl.uniform1f(this.uniforms.uSmooth, p.smooth);
        gl.uniform1f(this.uniforms.uBrightness, p.brightness);
        gl.uniform1f(this.uniforms.uSaturation, p.saturation);
        gl.uniform1f(this.uniforms.uAberration, p.aberration);

        gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    private draw2d(): void {
        const ctx = this.ctx2d;
        if (!ctx || !this.imageData || !this.fallbackCtx || !this.fallbackCanvas) return;

        this.fallbackCtx.putImageData(this.imageData, 0, 0);
        ctx.imageSmoothingEnabled = this.params.smooth > 0.5;

        const top = this.cropTop;
        const height = this.cropHeight;
        ctx.drawImage(
            this.fallbackCanvas,
            0, top, SCREEN_WIDTH, height,
            0, 0, this.canvas.width, this.canvas.height
        );
    }

    private updateGlow(): void {
        if (!this.glowCtx) return;
        const source = this.gl ? this.canvas : this.fallbackCanvas;
        if (!source) return;
        try {
            this.glowCtx.drawImage(source, 0, 0, this.glowCanvas.width, this.glowCanvas.height);
        } catch {
            // Tainted or zero-sized source — the glow is decorative, skip it.
        }
    }

    /**
     * A 12x12 reduction of the current frame. Blurred and scaled up behind the
     * screen it produces an ambient bias-light that tracks the game.
     */
    public getGlowCanvas(): HTMLCanvasElement {
        return this.glowCanvas;
    }

    /** PNG data URL of the presented frame, including shader effects. */
    public capture(): string | null {
        try {
            return this.canvas.toDataURL('image/png');
        } catch {
            return null;
        }
    }

    /** Small, unfiltered PNG for save-state thumbnails. */
    public captureThumbnail(width = 128): string | null {
        const source = this.gl ? this.canvas : this.fallbackCanvas;
        if (!source) return null;
        const out = document.createElement('canvas');
        const aspect = this.cropHeight / SCREEN_WIDTH;
        out.width = width;
        out.height = Math.round(width * aspect);
        const ctx = out.getContext('2d');
        if (!ctx) return null;
        ctx.imageSmoothingEnabled = true;
        try {
            ctx.drawImage(source, 0, 0, out.width, out.height);
            return out.toDataURL('image/png');
        } catch {
            return null;
        }
    }

    public clear(): void {
        if (this.gl) {
            this.gl.clear(this.gl.COLOR_BUFFER_BIT);
        } else if (this.ctx2d) {
            this.ctx2d.fillStyle = '#000';
            this.ctx2d.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }
        this.glowCtx?.clearRect(0, 0, this.glowCanvas.width, this.glowCanvas.height);
        this.lastBuffer = null;
    }

    /** The canvas this renderer is bound to, so callers can avoid re-attaching. */
    public get element(): HTMLCanvasElement {
        return this.canvas;
    }

    public dispose(): void {
        this.disposed = true;
        if (this.gl) {
            this.gl.deleteTexture(this.texture);
            this.gl.deleteProgram(this.program);
            // Deliberately NOT calling WEBGL_lose_context.loseContext(): a canvas
            // hands out one context per type for its lifetime, so losing it here
            // means any later getContext('webgl2') on the same element returns
            // that same dead context and nothing ever draws again.
        }
        this.gl = null;
        this.ctx2d = null;
    }
}
