export type EntitySource = 'user-override' | 'ocr' | 'metadata';

export type EntityInput = {
  source: EntitySource;
  text: string;
};

export type EntityType = 'org' | 'person' | 'place' | 'date' | 'money' | 'product' | 'title';

export type ExtractedEntity = {
  type: EntityType;
  text: string;
  source: EntitySource;
};

export type ScoredEntity = ExtractedEntity & {
  score: number;
  lineIndex: number | null;
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

const MONTH_PATTERN =
  'Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?';

const ORG_SUFFIX_PATTERN =
  'Inc\\.?|LLC|Ltd\\.?|Co\\.?|Corporation|Corp\\.?|Company|LLP|PLC|GmbH|S\\.A\\.|SAS|BV|Pty|AG';

const ORG_KEYWORD_PATTERN =
  'University|Institute|Bank|Agency|Association|Foundation|Committee|Council|Department|Ministry|College';

const TITLE_PHRASES: readonly string[] = [
  'Chief Executive Officer',
  'Chief Financial Officer',
  'Chief Technology Officer',
  'Chief Operating Officer',
  'Vice President',
  'Managing Director',
  'General Counsel',
  'Product Manager',
  'Project Manager',
  'Software Engineer',
  'Sales Manager',
];

const HONORIFICS = 'Mr|Mrs|Ms|Dr|Prof|Sir|Madam';

const ENTITY_REGEX = {
  date: new RegExp(
    `\\b(?:\\d{4}-\\d{2}-\\d{2}|\\d{1,2}[/-]\\d{1,2}[/-]\\d{2,4}|(?:${MONTH_PATTERN})\\s+\\d{1,2}(?:,?\\s+\\d{4})?|\\d{1,2}\\s+(?:${MONTH_PATTERN})\\s+\\d{4})\\b`,
    'gi'
  ),
  money: new RegExp(
    `(?:[$€£¥₹]\\s?\\d{1,3}(?:,\\d{3})*(?:\\.\\d+)?|\\b(?:USD|EUR|GBP|INR|JPY|CAD|AUD)\\s?\\d{1,3}(?:,\\d{3})*(?:\\.\\d+)?\\b)`,
    'g'
  ),
  org: new RegExp(
    `\\b[A-Z][\\w&.-]*(?:\\s+[A-Z][\\w&.-]*)*\\s+(?:${ORG_SUFFIX_PATTERN})\\b|\\b(?:[A-Z][\\w&.-]*\\s+)*(?:${ORG_KEYWORD_PATTERN})\\s+of\\s+[A-Z][\\w&.-]*(?:\\s+[A-Z][\\w&.-]*)*\\b`,
    'g'
  ),
  place: new RegExp(
    `\\b(?:[A-Z][a-z]+(?:\\s+[A-Z][a-z]+){0,2})\\s+(?:City|State|County|Province|District|Street|St\\.?|Avenue|Ave\\.?|Road|Rd\\.?|Boulevard|Blvd\\.?|Lane|Ln\\.?|Way|Drive|Dr\\.?|Plaza|Square|Park|Airport)\\b|\\b(?:City|State|Province|County)\\s+of\\s+[A-Z][a-z]+(?:\\s+[A-Z][a-z]+){0,2}\\b`,
    'g'
  ),
  title: new RegExp(`\\b(?:${HONORIFICS})\\.?\\b`, 'g'),
  person: new RegExp(
    `\\b(?:${HONORIFICS})\\.?\\s+[A-Z][a-z]+(?:\\s+[A-Z][a-z]+){0,2}\\b|\\b[A-Z][a-z]+\\s+[A-Z][a-z]+(?:\\s+[A-Z][a-z]+)?\\b`,
    'g'
  ),
  product: new RegExp(
    `\\b[A-Z][a-zA-Z]+\\s+(?:[A-Z]{1,3}\\d{1,4}|[A-Z]?\\d{2,4})\\b|\\b(?:Model|Series)\\s+[A-Z]?\\d+\\b`,
    'g'
  ),
};

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeCasing(value: string): string {
  const words = normalizeWhitespace(value).split(' ');
  return words
    .map((word) => {
      const cleaned = word.replace(/^[^\w]+|[^\w]+$/g, '');
      if (cleaned.length <= 4 && cleaned.toUpperCase() === cleaned) {
        return word.toUpperCase();
      }

      if (/[A-Z].*\d|\d/.test(cleaned)) {
        return word.toUpperCase() === word ? word : word;
      }

      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

function normalizeEntityText(type: EntityType, value: string): string {
  let normalized = normalizeWhitespace(value).replace(/[.,;:]+$/g, '');

  if (type === 'money') {
    normalized = normalized.replace(/\s+/g, '');
    return normalized;
  }

  return normalizeCasing(normalized);
}

function addEntitiesFromRegex(
  text: string,
  type: EntityType,
  pattern: RegExp,
  addEntity: (type: EntityType, value: string) => void
) {
  for (const match of text.matchAll(pattern)) {
    if (!match[0]) {
      continue;
    }

    addEntity(type, match[0]);
  }
}

export function compromiseExtractEntities(inputs: EntityInput[]): ExtractedEntity[] {
  const orderedInputs = sortEntityInputsByPriority(inputs);
  const results: ExtractedEntity[] = [];
  const seen = new Map<string, ExtractedEntity>();

  const addEntity = (source: EntitySource, type: EntityType, value: string) => {
    const normalizedText = normalizeEntityText(type, value);
    if (!normalizedText) {
      return;
    }

    const key = `${type}:${normalizedText.toLowerCase()}`;
    if (seen.has(key)) {
      return;
    }

    const entity: ExtractedEntity = {
      type,
      text: normalizedText,
      source,
    };

    seen.set(key, entity);
    results.push(entity);
  };

  for (const input of orderedInputs) {
    const text = input.text;
    if (!text.trim()) {
      continue;
    }

    addEntitiesFromRegex(text, 'date', ENTITY_REGEX.date, (type, value) =>
      addEntity(input.source, type, value)
    );
    addEntitiesFromRegex(text, 'money', ENTITY_REGEX.money, (type, value) =>
      addEntity(input.source, type, value)
    );
    addEntitiesFromRegex(text, 'org', ENTITY_REGEX.org, (type, value) =>
      addEntity(input.source, type, value)
    );
    addEntitiesFromRegex(text, 'place', ENTITY_REGEX.place, (type, value) =>
      addEntity(input.source, type, value)
    );
    addEntitiesFromRegex(text, 'product', ENTITY_REGEX.product, (type, value) =>
      addEntity(input.source, type, value)
    );

    for (const phrase of TITLE_PHRASES) {
      if (text.includes(phrase)) {
        addEntity(input.source, 'title', phrase);
      }
    }

    addEntitiesFromRegex(text, 'title', ENTITY_REGEX.title, (type, value) =>
      addEntity(input.source, type, value)
    );

    addEntitiesFromRegex(text, 'person', ENTITY_REGEX.person, (type, value) => {
      const cleaned = value.replace(new RegExp(`^(${HONORIFICS})\\.?\\s+`, 'i'), '').trim();
      if (cleaned) {
        addEntity(input.source, 'person', cleaned);
      }
    });
  }

  return results;
}

const ENTITY_TYPE_WEIGHTS: Record<EntityType, number> = {
  org: 95,
  person: 90,
  title: 88,
  product: 80,
  money: 78,
  date: 74,
  place: 70,
};

function findEntityLineIndex(text: string, entityText: string): number | null {
  if (!text.trim() || !entityText.trim()) {
    return null;
  }

  const target = entityText.toLowerCase();
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].toLowerCase().includes(target)) {
      return index;
    }
  }

  return null;
}

function scoreEntityByPosition(type: EntityType, lineIndex: number | null): number {
  const base = ENTITY_TYPE_WEIGHTS[type] ?? 50;
  if (lineIndex === null) {
    return base;
  }

  const positionBoost = Math.max(0, 30 - lineIndex * 3);
  return base + positionBoost;
}

export function scoreExtractedEntities(
  inputs: EntityInput[],
  entities: ExtractedEntity[]
): ScoredEntity[] {
  const orderedInputs = sortEntityInputsByPriority(inputs);
  const primaryText = orderedInputs[0]?.text ?? '';

  return entities.map((entity) => {
    const lineIndex = findEntityLineIndex(primaryText, entity.text);
    return {
      ...entity,
      lineIndex,
      score: scoreEntityByPosition(entity.type, lineIndex),
    };
  });
}

export function pickTopEntityCandidates(
  scoredEntities: ScoredEntity[],
  maxCandidates = 3
): ScoredEntity[] {
  const targetCount = Math.min(Math.max(maxCandidates, 1), 3);
  return [...scoredEntities]
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      if (left.lineIndex !== null && right.lineIndex !== null) {
        return left.lineIndex - right.lineIndex;
      }

      if (left.lineIndex !== null) {
        return -1;
      }

      if (right.lineIndex !== null) {
        return 1;
      }

      return left.text.localeCompare(right.text);
    })
    .slice(0, targetCount);
}
