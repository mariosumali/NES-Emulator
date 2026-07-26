import type { Toast } from '../hooks/useToasts';
import { AlertIcon, CheckIcon, CloseIcon, InfoIcon } from './icons';
import { IconButton } from './ui';

const ICONS = {
    success: CheckIcon,
    error: AlertIcon,
    warn: AlertIcon,
    info: InfoIcon,
} as const;

/**
 * Transient notifications.
 *
 * The region is a polite live region so screen readers hear "Saved to slot 2"
 * without focus moving. Errors go through an assertive region instead, since
 * they usually mean the thing the user just asked for did not happen.
 */
export function Toasts({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
    return (
        <>
            <div className="toast-region" aria-live="polite" aria-atomic="false">
                {toasts.map((toast) => {
                    const Icon = ICONS[toast.kind];
                    return (
                        <div
                            key={toast.id}
                            className="toast"
                            data-kind={toast.kind}
                            data-leaving={toast.leaving ? 'true' : undefined}
                            role={toast.kind === 'error' ? 'alert' : undefined}
                        >
                            <span className="toast-icon" aria-hidden="true"><Icon size={13} /></span>
                            <div className="toast-body">
                                <div className="toast-title">{toast.message}</div>
                                {toast.detail && <div className="toast-detail">{toast.detail}</div>}
                            </div>
                            <IconButton label="Dismiss" onClick={() => onDismiss(toast.id)}>
                                <CloseIcon size={14} />
                            </IconButton>
                        </div>
                    );
                })}
            </div>
        </>
    );
}

/**
 * A dedicated announcer for status that has no visual toast — speed changes,
 * rewind engaging, remap prompts.
 */
export function Announcer({ message, assertive }: { message: string; assertive?: boolean }) {
    return (
        <div
            className="sr-only"
            role="status"
            aria-live={assertive ? 'assertive' : 'polite'}
            aria-atomic="true"
        >
            {message}
        </div>
    );
}
