/**
 * Shared primitives.
 *
 * Every interactive control here is a real button/input with a real accessible
 * name — the previous UI shipped a dozen icon-only buttons whose only label was
 * a `title` attribute, which screen readers announce inconsistently and touch
 * users never see at all.
 */

import {
    useCallback,
    useEffect,
    useId,
    useRef,
    type ButtonHTMLAttributes,
    type ReactNode,
} from 'react';
import { CloseIcon } from './icons';

/* ------------------------------------------------------------- Button --- */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: 'default' | 'primary' | 'ghost' | 'outline' | 'danger';
    size?: 'sm' | 'md' | 'lg';
    active?: boolean;
};

export function Button({ variant = 'default', size = 'md', active, className, ...rest }: ButtonProps) {
    return (
        <button
            type="button"
            className={`btn${className ? ` ${className}` : ''}`}
            data-variant={variant}
            data-size={size}
            data-active={active ? 'true' : undefined}
            {...rest}
        />
    );
}

/* ---------------------------------------------------------- IconButton --- */

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
    /** Required: this is the button's accessible name, not a tooltip. */
    label: string;
    tone?: 'default' | 'primary' | 'recording';
    active?: boolean;
    large?: boolean;
    /** Appended to the tooltip, e.g. "Space". */
    shortcut?: string;
};

export function IconButton({
    label, tone = 'default', active, large, shortcut, className, children, ...rest
}: IconButtonProps) {
    return (
        <button
            type="button"
            className={`icon-btn${className ? ` ${className}` : ''}`}
            data-tone={tone !== 'default' ? tone : undefined}
            data-active={active ? 'true' : undefined}
            data-lg={large ? 'true' : undefined}
            aria-label={label}
            aria-pressed={active !== undefined ? active : undefined}
            title={shortcut ? `${label} (${shortcut})` : label}
            {...rest}
        >
            {children}
        </button>
    );
}

/* ------------------------------------------------------------- Switch --- */

export function Switch({
    checked, onChange, label, describedBy,
}: {
    checked: boolean;
    onChange: (next: boolean) => void;
    label: string;
    describedBy?: string;
}) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={label}
            aria-describedby={describedBy}
            className="switch"
            onClick={() => onChange(!checked)}
        />
    );
}

/* ---------------------------------------------------------- Segmented --- */

export interface SegmentedOption<T> {
    value: T;
    label: string;
    /** Announced instead of `label` when the visible label is an abbreviation. */
    srLabel?: string;
}

export function Segmented<T extends string | number>({
    value, options, onChange, label, full,
}: {
    value: T;
    options: Array<SegmentedOption<T>>;
    onChange: (next: T) => void;
    label: string;
    full?: boolean;
}) {
    return (
        <div className="segmented" role="radiogroup" aria-label={label} data-full={full ? 'true' : undefined}>
            {options.map((option) => (
                <button
                    key={String(option.value)}
                    type="button"
                    role="radio"
                    aria-checked={value === option.value}
                    aria-label={option.srLabel ?? option.label}
                    className="segmented-item"
                    onClick={() => onChange(option.value)}
                >
                    {option.label}
                </button>
            ))}
        </div>
    );
}

/* ------------------------------------------------------------- Slider --- */

export function Slider({
    value, min, max, step = 1, onChange, label, format,
}: {
    value: number;
    min: number;
    max: number;
    step?: number;
    onChange: (next: number) => void;
    label: string;
    format?: (v: number) => string;
}) {
    return (
        <div className="slider-row">
            <input
                type="range"
                className="slider"
                min={min}
                max={max}
                step={step}
                value={value}
                aria-label={label}
                aria-valuetext={format ? format(value) : undefined}
                onChange={(e) => onChange(Number(e.target.value))}
            />
            <span className="slider-value" aria-hidden="true">{format ? format(value) : value}</span>
        </div>
    );
}

/* -------------------------------------------------------------- Field --- */

export function Field({
    label, description, control, stacked,
}: {
    label: string;
    description?: string;
    control: ReactNode;
    stacked?: boolean;
}) {
    const id = useId();
    return (
        <div className="field" data-stacked={stacked ? 'true' : undefined}>
            <span className="field-label">
                <span id={id}>{label}</span>
                {description && <span className="field-desc">{description}</span>}
            </span>
            <span className="field-control">{control}</span>
        </div>
    );
}

export function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
    return (
        <section className="section">
            <div className="section-head">
                <h3 className="section-title">{title}</h3>
            </div>
            {hint && <p className="section-hint">{hint}</p>}
            {children}
        </section>
    );
}

/* -------------------------------------------------------------- Panel --- */

/**
 * A modal slide-over: focus moves in on open, is trapped while open, Escape
 * closes, and focus returns to whatever opened it.
 */
export function Panel({
    title, onClose, children, footer, wide, actions,
}: {
    title: string;
    onClose: () => void;
    children: ReactNode;
    footer?: ReactNode;
    wide?: boolean;
    actions?: ReactNode;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const restoreTo = useRef<HTMLElement | null>(null);
    const titleId = useId();

    useEffect(() => {
        restoreTo.current = document.activeElement as HTMLElement | null;
        // Focus the panel itself rather than its first control, so a screen
        // reader announces the panel's name before its contents.
        ref.current?.focus();
        return () => restoreTo.current?.focus?.();
    }, []);

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLDivElement>) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                onClose();
                return;
            }
            if (e.key !== 'Tab') return;

            const focusables = ref.current?.querySelectorAll<HTMLElement>(
                'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
            );
            if (!focusables || focusables.length === 0) return;

            const first = focusables[0];
            const last = focusables[focusables.length - 1];
            const active = document.activeElement;

            if (e.shiftKey && (active === first || active === ref.current)) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && active === last) {
                e.preventDefault();
                first.focus();
            }
        },
        [onClose]
    );

    return (
        <>
            <div className="scrim" onClick={onClose} aria-hidden="true" />
            <div
                ref={ref}
                className="panel"
                data-wide={wide ? 'true' : undefined}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                tabIndex={-1}
                onKeyDown={handleKeyDown}
            >
                <header className="panel-header">
                    <h2 className="panel-title" id={titleId}>{title}</h2>
                    {actions}
                    <IconButton label="Close panel" onClick={onClose} shortcut="Esc">
                        <CloseIcon />
                    </IconButton>
                </header>
                {children}
                {footer && <footer className="panel-footer">{footer}</footer>}
            </div>
        </>
    );
}

/* --------------------------------------------------------------- Misc --- */

export function EmptyNote({ children }: { children: ReactNode }) {
    return <p className="empty-note">{children}</p>;
}

export function Chip({
    tone, pulse, children,
}: {
    tone?: 'accent' | 'ok' | 'warn' | 'danger';
    pulse?: boolean;
    children: ReactNode;
}) {
    return (
        <span className="chip" data-tone={tone} data-pulse={pulse ? 'true' : undefined}>
            {pulse && <span className="chip-dot" />}
            {children}
        </span>
    );
}

export function Kbd({ children, empty }: { children: ReactNode; empty?: boolean }) {
    return <kbd className="kbd" data-empty={empty ? 'true' : undefined}>{children}</kbd>;
}
