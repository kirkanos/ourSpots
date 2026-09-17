/**
 * Kleiner Icon-Satz als Inline-SVG. Bewusst ohne Icon-Bibliothek: ein knappes
 * Dutzend Symbole rechtfertigt keine zusätzliche Abhängigkeit im Bundle.
 */
interface IconProps {
  className?: string;
}

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

export const IconMap = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="m9 4-6 2v14l6-2 6 2 6-2V4l-6 2-6-2Z" />
    <path d="M9 4v14M15 6v14" />
  </svg>
);

export const IconList = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
  </svg>
);

export const IconRoute = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <circle cx="6" cy="19" r="2.5" />
    <circle cx="18" cy="5" r="2.5" />
    <path d="M8.5 19h6a4 4 0 0 0 0-8h-5a4 4 0 0 1 0-8h6" />
  </svg>
);

export const IconPlus = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const IconCrosshair = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <circle cx="12" cy="12" r="7" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    <circle cx="12" cy="12" r="1.5" fill="currentColor" />
  </svg>
);

export const IconStar = ({ className, filled }: IconProps & { filled?: boolean }) => (
  <svg {...base} className={className} fill={filled ? 'currentColor' : 'none'}>
    <path d="m12 3.5 2.6 5.3 5.9.9-4.2 4.1 1 5.8-5.3-2.8-5.3 2.8 1-5.8L3.5 9.7l5.9-.9L12 3.5Z" />
  </svg>
);

export const IconPin = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z" />
    <circle cx="12" cy="10" r="2.5" />
  </svg>
);

export const IconCamera = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
    <circle cx="12" cy="13" r="3.5" />
  </svg>
);

export const IconSearch = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4.5 4.5" />
  </svg>
);

export const IconTrash = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M4 7h16M10 7V5h4v2M6 7l1 13h10l1-13M10 11v6M14 11v6" />
  </svg>
);

export const IconLogo = ({ className }: IconProps) => (
  <svg viewBox="0 0 64 64" className={className} aria-hidden>
    <rect width="64" height="64" rx="12" fill="var(--accent)" />
    <path
      d="M10 38V24a4 4 0 0 1 4-4h22l10 10v8a3 3 0 0 1-3 3h-2a6 6 0 0 0-12 0h-4a6 6 0 0 0-12 0a3 3 0 0 1-3-3Z"
      fill="var(--accent-contrast)"
    />
    <circle cx="21" cy="42" r="4" fill="var(--accent-contrast)" />
    <circle cx="43" cy="42" r="4" fill="var(--accent-contrast)" />
  </svg>
);
