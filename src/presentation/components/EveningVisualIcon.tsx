import type { ReactNode } from 'react';

export type EveningVisualIconName =
  | 'check'
  | 'list'
  | 'reflection'
  | 'calendar'
  | 'preparation'
  | 'moon'
  | 'sun'
  | 'target'
  | 'carry'
  | 'pencil'
  | 'ban'
  | 'lightbulb'
  | 'recommendation'
  | 'chevron-right'
  | 'arrow-right'
  | 'clock'
  | 'spark'
  | 'laptop'
  | 'chair'
  | 'close'
  | 'choice';

interface EveningVisualIconProps {
  readonly name: EveningVisualIconName;
  readonly size?: number;
  readonly className?: string;
}

export function EveningVisualIcon({ name, size = 24, className }: EveningVisualIconProps) {
  return (
    <svg
      className={className}
      data-evening-icon={name}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {iconPaths[name]}
    </svg>
  );
}

const iconPaths: Readonly<Record<EveningVisualIconName, ReactNode>> = {
  check: <path d="m5 12 4 4 10-10" />,
  list: (
    <>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <path d="M4 6h.01M4 12h.01M4 18h.01" />
    </>
  ),
  reflection: (
    <>
      <path d="M5 7V3m0 0h4M5 3l3 3" />
      <path d="M19 17v4m0 0h-4m4 0-3-3" />
      <path d="M6.4 16.5A7 7 0 0 1 17.5 7M17.6 7.5A7 7 0 0 1 6.5 17" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01" />
    </>
  ),
  preparation: (
    <>
      <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2h7.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z" />
      <path d="M8 13h8M12 9v8" />
    </>
  ),
  moon: <path d="M20.3 15.7A9 9 0 1 1 8.3 3.7a7 7 0 0 0 12 12Z" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" />
    </>
  ),
  carry: (
    <>
      <path d="M4 7h10a5 5 0 0 1 5 5v1" />
      <path d="m15 10 4 4 4-4" />
      <path d="M4 4v6h6" />
    </>
  ),
  pencil: (
    <>
      <path d="m4 20 4.5-1 10-10a2.12 2.12 0 0 0-3-3l-10 10Z" />
      <path d="m14.5 7.5 3 3M4 20h6" />
    </>
  ),
  ban: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m5.6 5.6 12.8 12.8" />
    </>
  ),
  lightbulb: (
    <>
      <path d="M9 18h6M10 22h4" />
      <path d="M8.5 15.5A7 7 0 1 1 15.5 15.5c-.9.7-1.5 1.3-1.5 2.5h-4c0-1.2-.6-1.8-1.5-2.5Z" />
    </>
  ),
  recommendation: (
    <>
      <circle cx="11" cy="13" r="7" />
      <circle cx="11" cy="13" r="3" />
      <path d="m13 11 7-7M16 4h4v4" />
    </>
  ),
  'chevron-right': <path d="m9 18 6-6-6-6" />,
  'arrow-right': (
    <>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  spark: (
    <>
      <path d="m12 3 1.4 4.1L17.5 8.5l-4.1 1.4L12 14l-1.4-4.1-4.1-1.4 4.1-1.4Z" />
      <path d="m18.5 14 .8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8Z" />
    </>
  ),
  laptop: (
    <>
      <rect x="4" y="4" width="16" height="12" rx="1.5" />
      <path d="M2.5 20h19M8 20l1-4h6l1 4" />
    </>
  ),
  chair: (
    <>
      <path d="M7 12V7a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v5" />
      <path d="M5 11v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4M7 17v4M17 17v4" />
    </>
  ),
  close: <path d="m6 6 12 12M18 6 6 18" />,
  choice: (
    <>
      <circle cx="6" cy="7" r="2" />
      <circle cx="6" cy="17" r="2" />
      <path d="M11 7h9M11 17h9" />
    </>
  ),
};
