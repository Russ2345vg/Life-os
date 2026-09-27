import type { SVGProps } from 'react';

export type AppIconName =
  | 'search'
  | 'microphone'
  | 'today'
  | 'management'
  | 'decisions'
  | 'completed'
  | 'actions'
  | 'history'
  | 'more'
  | 'create'
  | 'routine'
  | 'walks'
  | 'statistics'
  | 'spheres'
  | 'goals'
  | 'settings'
  | 'account'
  | 'collapse'
  | 'expand'
  | 'arrow-right'
  | 'menu'
  | 'close'
  | 'focus'
  | 'lock'
  | 'water'
  | 'shower';

interface AppIconProps extends SVGProps<SVGSVGElement> {
  readonly name: AppIconName;
}

export function AppIcon({ name, ...props }: AppIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1.25em"
      height="1.25em"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {iconPath(name)}
    </svg>
  );
}

function iconPath(name: AppIconName) {
  switch (name) {
    case 'search':
      return (
        <>
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="m16 16 5 5" />
        </>
      );
    case 'arrow-right':
      return <path d="M4 12h16m-6-6 6 6-6 6" />;
    case 'microphone':
      return (
        <>
          <rect x="9" y="3" width="6" height="12" rx="3" />
          <path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" />
        </>
      );
    case 'management':
      return (
        <>
          <path d="M4 20V9M10 20V4M16 20v-7M22 20H2" />
          <path d="m3 6 6-4 6 7 6-5" />
        </>
      );
    case 'today':
      return (
        <>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M8 3v4M16 3v4M3 10h18" />
          <path d="M8 14h3M8 17h6" />
        </>
      );
    case 'decisions':
      return (
        <>
          <path d="M9 5h11M9 12h11M9 19h11" />
          <path d="m3.5 5 1.4 1.4L7.5 3.8M3.5 12l1.4 1.4 2.6-2.6M3.5 19l1.4 1.4 2.6-2.6" />
        </>
      );
    case 'completed':
      return <path d="m7 12.5 3.2 3.2L17.5 8.5" />;
    case 'actions':
      return (
        <>
          <path d="M13 2 4.5 13H11l-1 9 8.5-11H12l1-9Z" />
        </>
      );
    case 'history':
      return (
        <>
          <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
          <path d="M3 3v5h5M12 7v5l3 2" />
        </>
      );
    case 'more':
      return (
        <>
          <circle cx="5" cy="12" r="1.2" fill="currentColor" stroke="none" />
          <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
          <circle cx="19" cy="12" r="1.2" fill="currentColor" stroke="none" />
        </>
      );
    case 'create':
      return <path d="M12 5v14M5 12h14" />;
    case 'routine':
      return (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </>
      );
    case 'walks':
      return (
        <>
          <circle cx="13" cy="4" r="2" />
          <path d="m10 22 2-7-3-3 2-4 4 3 3 1M6 22l3-6" />
        </>
      );
    case 'statistics':
      return (
        <>
          <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
        </>
      );
    case 'spheres':
      return (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9S14.5 18.5 12 21M12 3C9.5 5.5 8.2 8.5 8.2 12S9.5 18.5 12 21" />
        </>
      );
    case 'goals':
      return (
        <>
          <circle cx="12" cy="12" r="8" />
          <circle cx="12" cy="12" r="3" />
          <path d="M12 4V2M12 22v-2M4 12H2M22 12h-2" />
        </>
      );
    case 'settings':
      return (
        <>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
        </>
      );
    case 'account':
      return (
        <>
          <circle cx="12" cy="8" r="4" />
          <path d="M4.5 21a7.5 7.5 0 0 1 15 0" />
        </>
      );
    case 'collapse':
      return (
        <>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M9 4v16M16 9l-3 3 3 3" />
        </>
      );
    case 'expand':
      return (
        <>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M9 4v16M14 9l3 3-3 3" />
        </>
      );
    case 'menu':
      return <path d="M4 7h16M4 12h16M4 17h16" />;
    case 'close':
      return <path d="m6 6 12 12M18 6 6 18" />;
    case 'focus':
      return (
        <>
          <circle cx="12" cy="12" r="3" />
          <path d="M8 4H5a1 1 0 0 0-1 1v3M16 4h3a1 1 0 0 1 1 1v3M8 20H5a1 1 0 0 1-1-1v-3M16 20h3a1 1 0 0 0 1-1v-3" />
        </>
      );
    case 'lock':
      return (
        <>
          <rect x="5" y="10" width="14" height="10" rx="2" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v2" />
        </>
      );
    case 'water':
      return (
        <path d="M12 3.5c-2.8 3.8-5.5 6.9-5.5 10.2a5.5 5.5 0 0 0 11 0C17.5 10.4 14.8 7.3 12 3.5Z" />
      );
    case 'shower':
      return (
        <>
          <path d="M5 9a7 7 0 0 1 14 0" />
          <path d="M4 9h16M8 13v1M12 13v2M16 13v1M8 18v1M12 19v1M16 18v1" />
        </>
      );
  }
}
