import type { ReactNode, SVGProps } from 'react';

type DirectionSphereIconName =
  'money' | 'health' | 'growth' | 'relationships' | 'work' | 'home' | 'neutral';

interface DirectionSphereIconProps extends SVGProps<SVGSVGElement> {
  readonly sphereName: string | null;
}

const SPHERE_ICON_NAMES: Readonly<Record<string, DirectionSphereIconName>> = {
  деньги: 'money',
  финансы: 'money',
  здоровье: 'health',
  развитие: 'growth',
  отношения: 'relationships',
  работа: 'work',
  дело: 'work',
  дом: 'home',
};

function getDirectionSphereIconName(sphereName: string | null): DirectionSphereIconName {
  if (sphereName === null) return 'neutral';
  return SPHERE_ICON_NAMES[normalizeSphereName(sphereName)] ?? 'neutral';
}

export function DirectionSphereIcon({ sphereName, ...props }: DirectionSphereIconProps) {
  const iconName = getDirectionSphereIconName(sphereName);

  return (
    <svg
      viewBox="0 0 32 32"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      data-direction-sphere-icon={iconName}
      {...props}
    >
      {iconPath(iconName)}
    </svg>
  );
}

function normalizeSphereName(value: string): string {
  return value.trim().toLocaleLowerCase('ru-RU').replaceAll('ё', 'е');
}

function iconPath(name: DirectionSphereIconName): ReactNode {
  switch (name) {
    case 'money':
      return (
        <>
          <path d="M16 3.5 26 7v7.2c0 6.3-3.8 11.7-10 14.3-6.2-2.6-10-8-10-14.3V7l10-3.5Z" />
          <path d="M12.2 17.1h5.1a3.6 3.6 0 1 0 0-7.2h-3.7v12.2M11.3 17.1h7.8M11.3 20h6.2" />
        </>
      );
    case 'health':
      return <path d="M3 16h5l2.6-6 4.3 12 3.2-8 2 4H29" />;
    case 'growth':
      return (
        <>
          <path d="M5 25 13 17l5 4 9-11" />
          <path d="M20 10h7v7" />
        </>
      );
    case 'relationships':
      return (
        <>
          <circle cx="11" cy="11" r="3.5" />
          <circle cx="22" cy="12" r="3" />
          <path d="M4.5 25c.5-4.5 3-7 6.5-7s6 2.5 6.5 7M17 20c1.1-1.6 2.8-2.5 5-2.5 3.2 0 5.2 2.2 5.5 6" />
        </>
      );
    case 'work':
      return (
        <>
          <rect x="4" y="9" width="24" height="17" rx="2.5" />
          <path d="M11 9V6h10v3M4 16.5c7.5 3 16.5 3 24 0M14 18h4" />
        </>
      );
    case 'home':
      return (
        <>
          <path d="m4 15 12-10 12 10" />
          <path d="M7.5 13v13h17V13M13 26v-8h6v8" />
        </>
      );
    case 'neutral':
      return (
        <>
          <circle cx="16" cy="16" r="12" />
          <path d="m19.5 12.5-2.2 4.8-4.8 2.2 2.2-4.8 4.8-2.2Z" />
        </>
      );
  }
}
