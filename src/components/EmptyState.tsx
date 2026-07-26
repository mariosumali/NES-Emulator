import { useRef, useState } from 'react';
import { Button } from './ui';
import { CartridgeIcon, LibraryIcon, UploadIcon } from './icons';

interface EmptyStateProps {
    onFiles: (files: FileList | File[]) => void;
    onOpenLibrary: () => void;
    libraryCount: number;
    dragging: boolean;
}

/**
 * What a first-time visitor sees.
 *
 * Occupies the same footprint as the screen so loading a ROM is a cross-fade
 * inside a stable frame rather than a layout jump — and, unlike a bare black
 * canvas, it says what the app is and what to do next.
 */
export function EmptyState({ onFiles, onOpenLibrary, libraryCount, dragging }: EmptyStateProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [localDrag, setLocalDrag] = useState(false);

    return (
        <div
            className="empty-state"
            data-dragging={dragging || localDrag ? 'true' : undefined}
            onDragOver={(e) => { e.preventDefault(); setLocalDrag(true); }}
            onDragLeave={() => setLocalDrag(false)}
            onDrop={(e) => {
                e.preventDefault();
                setLocalDrag(false);
                if (e.dataTransfer.files.length > 0) onFiles(e.dataTransfer.files);
            }}
        >
            <span className="empty-cartridge" aria-hidden="true">
                <CartridgeIcon size={44} />
            </span>

            <div className="stack" style={{ gap: 'var(--sp-2)', alignItems: 'center' }}>
                <h2 className="empty-title">Insert a cartridge</h2>
                <p className="empty-sub">
                    Drop a <code>.nes</code> or <code>.zip</code> file anywhere on this page, or pick one from
                    your computer. Everything runs locally — nothing is uploaded.
                </p>
            </div>

            <div className="empty-actions">
                {/*
                  A real button that forwards to a hidden input. Styling a <label>
                  around `<input hidden>` — the usual shortcut — makes the app's
                  primary action completely unreachable by keyboard.
                */}
                <Button variant="primary" size="lg" onClick={() => inputRef.current?.click()}>
                    <UploadIcon size={17} />
                    Choose a ROM
                </Button>

                {libraryCount > 0 && (
                    <Button variant="outline" size="lg" onClick={onOpenLibrary}>
                        <LibraryIcon size={17} />
                        Library ({libraryCount})
                    </Button>
                )}

                <input
                    ref={inputRef}
                    type="file"
                    accept=".nes,.zip,application/zip"
                    multiple
                    className="sr-only"
                    tabIndex={-1}
                    aria-hidden="true"
                    onChange={(e) => {
                        if (e.target.files?.length) onFiles(e.target.files);
                        // Reset so re-picking the same file fires change again.
                        e.target.value = '';
                    }}
                />
            </div>

            <p className="empty-legal">
                This emulator ships no games. Use ROMs you have dumped from cartridges you own, or
                homebrew released for free by its authors.
            </p>
        </div>
    );
}
