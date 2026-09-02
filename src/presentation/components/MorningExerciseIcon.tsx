interface MorningExerciseIconProps {
  readonly exerciseId: string;
}

export function MorningExerciseIcon({ exerciseId }: MorningExerciseIconProps) {
  const path = ICON_PATHS[exerciseId] ?? ICON_PATHS.custom;
  return (
    <svg viewBox="0 0 32 32" role="presentation" focusable="false" aria-hidden="true">
      <circle cx="16" cy="7" r="3" />
      {path}
    </svg>
  );
}

const ICON_PATHS: Readonly<Record<string, React.ReactNode>> = {
  'morning-exercise.push-ups': (
    <>
      <path d="M4 23h24M9 19l6-6 7 3 4 7M15 13l-2 9" />
    </>
  ),
  'morning-exercise.pull-ups': (
    <>
      <path d="M5 4h22M10 4v8l6 7 6-7V4M12 24l4-5 4 5" />
    </>
  ),
  'morning-exercise.squats': <path d="M16 10v8m0-4-7 3m7-3 7 3M9 17l3 10m11-10-3 10" />,
  'morning-exercise.plank': <path d="M4 23h24M8 20l7-7 9 4 4 6M15 13l1 10" />,
  'morning-exercise.abs': <path d="M7 24h20M10 22l5-10 6 2 5 8M15 12l-3 11" />,
  custom: <path d="M16 11v16M8 19h16M11 14l5-3 5 3" />,
};
