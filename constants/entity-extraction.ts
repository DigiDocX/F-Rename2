export type EntitySource = 'user-override' | 'ocr' | 'metadata';

export type EntityInput = {
  source: EntitySource;
  text: string;
};

export const ENTITY_SOURCE_PRIORITY: readonly EntitySource[] = [
  'user-override',
  'ocr',
  'metadata',
];

const ENTITY_SOURCE_RANK: Record<EntitySource, number> = {
  'user-override': 0,
  ocr: 1,
  metadata: 2,
};

export function sortEntityInputsByPriority(inputs: EntityInput[]): EntityInput[] {
  return [...inputs].sort((left, right) => {
    const rankDelta = ENTITY_SOURCE_RANK[left.source] - ENTITY_SOURCE_RANK[right.source];
    if (rankDelta !== 0) {
      return rankDelta;
    }

    return left.text.localeCompare(right.text);
  });
}
