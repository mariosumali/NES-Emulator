import { useEffect, useRef, useImperativeHandle, forwardRef, useState } from 'react';

interface ScreenProps {
    onRef: (draw: (buffer: number[]) => void) => void;
    scale: number;
    crtFilter: 'off' | 'scanlines' | 'crt';
    isFullscreen: boolean;
    onFullscreenChange: (isFullscreen: boolean) => void;
}

export interface ScreenHandle {
    getCanvas: () => HTMLCanvasElement | null;
    takeScreenshot: () => string | null;
}

export const Screen = forwardRef<ScreenHandle, ScreenProps>(({
    onRef,
    scale,
    crtFilter,
    isFullscreen,
    onFullscreenChange
}, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [fullscreenScale, setFullscreenScale] = useState(1);

    useImperativeHandle(ref, () => ({
        getCanvas: () => canvasRef.current,
        takeScreenshot: () => {
            if (canvasRef.current) {
                return canvasRef.current.toDataURL('image/png');
            }
            return null;
        }
    }));

    useEffect(() => {
        if (!canvasRef.current) return;
        const ctx = canvasRef.current.getContext('2d');
        if (!ctx) return;

        const imageData = ctx.createImageData(256, 240);
        // 32-bit view for faster access
        const buf32 = new Uint32Array(imageData.data.buffer);

        const draw = (buffer: number[]) => {
            // buffer is 32-bit integers (0xRRGGBB). 
            // We write to 32-bit view.
            for (let i = 0; i < 256 * 240; i++) {
                // Set alpha to 255 (0xFF)
                buf32[i] = 0xFF000000 | buffer[i];
            }

            ctx.putImageData(imageData, 0, 0);
        };

        onRef(draw);
    }, [onRef]);

    // Handle fullscreen changes
    useEffect(() => {
        const handleFullscreenChange = () => {
            const isNowFullscreen = document.fullscreenElement === containerRef.current;
            onFullscreenChange(isNowFullscreen);

            if (isNowFullscreen) {
                // Calculate scale to fit screen while maintaining aspect ratio
                const screenWidth = window.innerWidth;
                const screenHeight = window.innerHeight;
                const gameWidth = 256;
                const gameHeight = 240;

                const scaleX = screenWidth / gameWidth;
                const scaleY = screenHeight / gameHeight;
                setFullscreenScale(Math.min(scaleX, scaleY) * 0.95); // 95% to leave some margin
            }
        };

        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, [onFullscreenChange]);

    // Toggle fullscreen
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        if (isFullscreen && !document.fullscreenElement) {
            container.requestFullscreen().catch(err => {
                console.error('Error entering fullscreen:', err);
            });
        } else if (!isFullscreen && document.fullscreenElement) {
            document.exitFullscreen().catch(err => {
                console.error('Error exiting fullscreen:', err);
            });
        }
    }, [isFullscreen]);

    const currentScale = isFullscreen ? fullscreenScale : scale;

    const getFilterClass = () => {
        switch (crtFilter) {
            case 'scanlines': return 'filter-scanlines';
            case 'crt': return 'filter-crt';
            default: return '';
        }
    };

    return (
        <div
            ref={containerRef}
            className={`screen-container ${isFullscreen ? 'fullscreen' : ''} ${getFilterClass()}`}
        >
            <canvas
                ref={canvasRef}
                width={256}
                height={240}
                style={{
                    imageRendering: 'pixelated',
                    width: `${256 * currentScale}px`,
                    height: `${240 * currentScale}px`,
                    border: isFullscreen ? 'none' : '4px solid #333',
                    background: '#000'
                }}
            />
            {crtFilter === 'scanlines' && <div className="scanline-overlay" />}
            {crtFilter === 'crt' && <div className="crt-overlay" />}
        </div>
    );
});

Screen.displayName = 'Screen';
