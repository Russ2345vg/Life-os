export function exerciseCountLabel(count: number): string {
  return `${count} ${russianPlural(count, 'упражнение', 'упражнения', 'упражнений')}`;
}

export function setsCountLabel(count: number): string {
  return `${count} ${russianPlural(count, 'подход', 'подхода', 'подходов')}`;
}

function russianPlural(count: number, one: string, few: string, many: string): string {
  const absolute = Math.abs(count) % 100;
  const last = absolute % 10;
  if (absolute >= 11 && absolute <= 14) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}
