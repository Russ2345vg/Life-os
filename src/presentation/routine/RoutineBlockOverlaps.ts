interface RoutineInterval {
  readonly startTime: string;
  readonly endTime: string;
  readonly title: string;
  readonly isSkipped?: boolean;
}

export function findRoutineBlockOverlaps(blocks: readonly RoutineInterval[]): readonly string[] {
  const overlaps: string[] = [];
  for (let left = 0; left < blocks.length; left += 1) {
    for (let right = left + 1; right < blocks.length; right += 1) {
      const first = blocks[left];
      const second = blocks[right];
      if (
        first !== undefined &&
        second !== undefined &&
        first.isSkipped !== true &&
        second.isSkipped !== true &&
        first.startTime < second.endTime &&
        second.startTime < first.endTime
      ) {
        overlaps.push(
          `${first.startTime}–${first.endTime} «${first.title}» и ${second.startTime}–${second.endTime} «${second.title}»`,
        );
      }
    }
  }
  return overlaps;
}
