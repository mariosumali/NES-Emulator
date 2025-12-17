import { useEffect, useRef } from 'react';

interface ScreenProps {
    onRef: (draw: (buffer: number[]) => void) => void;
    scale: number;
}

export const Screen = ({ onRef, scale }: ScreenProps) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

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

    return (
        <div className="screen-container">
            <canvas
                ref={canvasRef}
                width={256}
                height={240}
                style={{
                    imageRendering: 'pixelated',
                    width: `${256 * scale}px`,
                    height: `${240 * scale}px`,
                    border: '4px solid #333',
                    background: '#000'
                }}
            />
        </div>
    );
};
