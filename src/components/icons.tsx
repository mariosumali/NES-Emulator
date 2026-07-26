/**
 * Icon set. Single stroke weight, 24px grid, `currentColor` throughout so icons
 * inherit state colour from their button.
 */

interface IconProps {
    size?: number;
    className?: string;
}

const stroke = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
};

function Svg({ size = 18, className, children }: IconProps & { children: React.ReactNode }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            className={className}
            aria-hidden="true"
            focusable="false"
        >
            {children}
        </svg>
    );
}

export const PlayIcon = (p: IconProps) => (
    <Svg {...p}><path d="M7 4.5 19.5 12 7 19.5Z" fill="currentColor" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" /></Svg>
);

export const PauseIcon = (p: IconProps) => (
    <Svg {...p}><rect x="6.5" y="4.5" width="4" height="15" rx="1.4" fill="currentColor" /><rect x="13.5" y="4.5" width="4" height="15" rx="1.4" fill="currentColor" /></Svg>
);

export const StepIcon = (p: IconProps) => (
    <Svg {...p}><path d="M5 5.5 15 12 5 18.5Z" fill="currentColor" /><rect x="16.8" y="5" width="2.6" height="14" rx="1.1" fill="currentColor" /></Svg>
);

export const ResetIcon = (p: IconProps) => (
    <Svg {...p}><path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3 8.6" {...stroke} /><path d="M3 4v5h5" {...stroke} /></Svg>
);

export const RewindIcon = (p: IconProps) => (
    <Svg {...p}><path d="M11.5 6.5v11L4 12Z" fill="currentColor" /><path d="M20 6.5v11L12.5 12Z" fill="currentColor" /></Svg>
);

export const FastForwardIcon = (p: IconProps) => (
    <Svg {...p}><path d="M12.5 6.5v11L20 12Z" fill="currentColor" /><path d="M4 6.5v11L11.5 12Z" fill="currentColor" /></Svg>
);

export const SaveIcon = (p: IconProps) => (
    <Svg {...p}><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" {...stroke} /><path d="M17 21v-8H7v8M7 3v5h8" {...stroke} /></Svg>
);

export const LoadIcon = (p: IconProps) => (
    <Svg {...p}><path d="M3 15v4a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4" {...stroke} /><path d="m7 10 5 5 5-5M12 15V3" {...stroke} /></Svg>
);

export const CameraIcon = (p: IconProps) => (
    <Svg {...p}><path d="M3 8.5A2 2 0 0 1 5 6.5h2l1.4-2h7.2L17 6.5h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" {...stroke} /><circle cx="12" cy="13" r="3.6" {...stroke} /></Svg>
);

export const RecordIcon = (p: IconProps) => (
    <Svg {...p}><circle cx="12" cy="12" r="9" {...stroke} /><circle cx="12" cy="12" r="4.2" fill="currentColor" /></Svg>
);

export const StopIcon = (p: IconProps) => (
    <Svg {...p}><rect x="6" y="6" width="12" height="12" rx="2.4" fill="currentColor" /></Svg>
);

export const FullscreenIcon = (p: IconProps) => (
    <Svg {...p}><path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3" {...stroke} /></Svg>
);

export const ExitFullscreenIcon = (p: IconProps) => (
    <Svg {...p}><path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3" {...stroke} /></Svg>
);

export const SettingsIcon = (p: IconProps) => (
    <Svg {...p}><circle cx="12" cy="12" r="3" {...stroke} /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.1-1.55 1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1Z" {...stroke} /></Svg>
);

export const LibraryIcon = (p: IconProps) => (
    <Svg {...p}><rect x="3" y="4" width="5.5" height="16" rx="1.4" {...stroke} /><rect x="10.5" y="4" width="5.5" height="16" rx="1.4" {...stroke} /><path d="m18.4 5.4 3 15" {...stroke} /></Svg>
);

export const CartridgeIcon = (p: IconProps) => (
    <Svg {...p}><path d="M5 3h14a1 1 0 0 1 1 1v13.5a1 1 0 0 1-.3.7l-2.5 2.5a1 1 0 0 1-.7.3H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" {...stroke} /><rect x="7" y="6" width="10" height="5.5" rx="0.8" {...stroke} /><path d="M8 15h8" {...stroke} /></Svg>
);

export const CheatIcon = (p: IconProps) => (
    <Svg {...p}><path d="m9 11 2 2 4-4" {...stroke} /><path d="M12 3 4 6v6c0 4.5 3.2 8.3 8 9 4.8-.7 8-4.5 8-9V6Z" {...stroke} /></Svg>
);

export const CloseIcon = (p: IconProps) => (
    <Svg {...p}><path d="M6 6l12 12M18 6 6 18" {...stroke} /></Svg>
);

export const SearchIcon = (p: IconProps) => (
    <Svg {...p}><circle cx="11" cy="11" r="7" {...stroke} /><path d="m20 20-3.6-3.6" {...stroke} /></Svg>
);

export const VolumeIcon = (p: IconProps) => (
    <Svg {...p}><path d="M11 5 6.5 8.5H3v7h3.5L11 19Z" {...stroke} /><path d="M15.5 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" {...stroke} /></Svg>
);

export const MuteIcon = (p: IconProps) => (
    <Svg {...p}><path d="M11 5 6.5 8.5H3v7h3.5L11 19Z" {...stroke} /><path d="m16 9.5 5 5M21 9.5l-5 5" {...stroke} /></Svg>
);

export const StarIcon = ({ filled, ...p }: IconProps & { filled?: boolean }) => (
    <Svg {...p}><path d="m12 3.6 2.6 5.3 5.9.9-4.3 4.2 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.8l5.9-.9Z" {...stroke} fill={filled ? 'currentColor' : 'none'} /></Svg>
);

export const TrashIcon = (p: IconProps) => (
    <Svg {...p}><path d="M4 7h16M9.5 7V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2M6 7l.8 12a2 2 0 0 0 2 1.9h6.4a2 2 0 0 0 2-1.9L18 7" {...stroke} /></Svg>
);

export const KeyboardIcon = (p: IconProps) => (
    <Svg {...p}><rect x="2.5" y="6" width="19" height="12" rx="2" {...stroke} /><path d="M6.5 10h.01M10 10h.01M13.5 10h.01M17 10h.01M8 14h8" {...stroke} /></Svg>
);

export const GamepadIcon = (p: IconProps) => (
    <Svg {...p}><path d="M6.5 7h11a4.5 4.5 0 0 1 4.4 5.4l-.9 4.3A2.6 2.6 0 0 1 18.5 19c-1 0-1.6-.6-2.2-1.4L15 16H9l-1.3 1.6C7.1 18.4 6.5 19 5.5 19a2.6 2.6 0 0 1-2.5-2.3l-.9-4.3A4.5 4.5 0 0 1 6.5 7Z" {...stroke} /><path d="M8 11v2.5M6.75 12.25h2.5M15.5 11.5h.01M17.5 13.5h.01" {...stroke} /></Svg>
);

export const MonitorIcon = (p: IconProps) => (
    <Svg {...p}><rect x="2.5" y="4" width="19" height="13" rx="2" {...stroke} /><path d="M8.5 21h7M12 17v4" {...stroke} /></Svg>
);

export const SlidersIcon = (p: IconProps) => (
    <Svg {...p}><path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h9M17 18h3" {...stroke} /><circle cx="15" cy="6" r="2" {...stroke} /><circle cx="9" cy="12" r="2" {...stroke} /><circle cx="15" cy="18" r="2" {...stroke} /></Svg>
);

export const CpuIcon = (p: IconProps) => (
    <Svg {...p}><rect x="6" y="6" width="12" height="12" rx="1.6" {...stroke} /><rect x="9.5" y="9.5" width="5" height="5" rx="0.8" {...stroke} /><path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3" {...stroke} /></Svg>
);

export const CheckIcon = (p: IconProps) => (
    <Svg {...p}><path d="m5 12.5 4.5 4.5L19 7.5" {...stroke} /></Svg>
);

export const AlertIcon = (p: IconProps) => (
    <Svg {...p}><path d="M12 8.5v5M12 17h.01" {...stroke} /><circle cx="12" cy="12" r="9" {...stroke} /></Svg>
);

export const InfoIcon = (p: IconProps) => (
    <Svg {...p}><path d="M12 11v5.5M12 7.5h.01" {...stroke} /><circle cx="12" cy="12" r="9" {...stroke} /></Svg>
);

export const UploadIcon = (p: IconProps) => (
    <Svg {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" {...stroke} /><path d="m7 8 5-5 5 5M12 3v12" {...stroke} /></Svg>
);

export const DownloadIcon = (p: IconProps) => (
    <Svg {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" {...stroke} /><path d="m7 10 5 5 5-5M12 15V3" {...stroke} /></Svg>
);

export const CommandIcon = (p: IconProps) => (
    <Svg {...p}><path d="M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3Z" {...stroke} /></Svg>
);

export const SunIcon = (p: IconProps) => (
    <Svg {...p}><circle cx="12" cy="12" r="4" {...stroke} /><path d="M12 2v2.5M12 19.5V22M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2 12h2.5M19.5 12H22M4.2 19.8 6 18M18 6l1.8-1.8" {...stroke} /></Svg>
);

export const MoonIcon = (p: IconProps) => (
    <Svg {...p}><path d="M20.5 14.3A8.5 8.5 0 0 1 9.7 3.5a8.5 8.5 0 1 0 10.8 10.8Z" {...stroke} /></Svg>
);
