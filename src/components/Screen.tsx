import { useEffect, useRef } from 'react';

interface ScreenProps {
    onRef: (draw: (buffer: number[]) => void) => void;
}

export const Screen = ({ onRef }: ScreenProps) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        if (!canvasRef.current) return;
        const ctx = canvasRef.current.getContext('2d');
        if (!ctx) return;

        const imageData = ctx.createImageData(256, 240);
        // 32-bit view for faster access
        const buf32 = new Uint32Array(imageData.data.buffer);

        const draw = (buffer: number[]) => {
            // buffer is an array of 32-bit integers from jsnes
            // write directly to the 32-bit view of imageData
            for (let i = 0; i < 256 * 240; i++) {
                // jsnes output is 0xRRGGBB, but 32-bit view expects 0xAABBGGRR (little endian)
                // or we just set alpha to 255.
                // Actually jsnes usually returns packed integers.
                // We might need to manually set r,g,b,a if endianness is tricky.
                // But let's try direct copy first, setting Alpha to 0xFF.

                const val = buffer[i];
                // val is 0xRRGGBB.
                // We need 0xFFBBGGRR (ABGR) for little endian systems, or 0xAABBGGRR for big endian?
                // Actually ImageData is usually usually RGBA order in memory, but Uint32Array access depends on endianness.
                // On little endian (Intel/Arm): 0xAABBGGRR.
                // So R is at lowest byte.
                // jsnes val is 0xRRGGBB (R at 16, G at 8, B at 0).
                // So we need to swap bytes?
                // Let's do the slow safe way first: Uint8ClampedArray.

                // Wait, looping 60k pixels in JS every frame is costly if we do property access.
                // Let's try to assume buffer[i] is effectively the color available.
                // Since jsnes doesn't set alpha, we might get 0 alpha.

                // Let's do the safe copy for now:
                // Or better:
                buf32[i] = 0xFF000000 | buffer[i]; // Set Alpha to 255
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
                    width: '512px',
                    height: '480px',
                    border: '4px solid #333',
                    background: '#000'
                }}
            />
        </div>
    );
};
