import TextRecognition from '@react-native-ml-kit/text-recognition';

import { CroppedImage } from './pdf-page-crop';

export type OcrPoint = {
  x: number;
  y: number;
};

export type OcrFrame = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type OcrElement = {
  text: string;
  frame?: OcrFrame;
  cornerPoints?: OcrPoint[];
};

export type OcrLine = {
  text: string;
  frame?: OcrFrame;
  cornerPoints?: OcrPoint[];
  elements?: OcrElement[];
};

export type OcrBlock = {
  text: string;
  frame?: OcrFrame;
  cornerPoints?: OcrPoint[];
  lines?: OcrLine[];
};

export type OcrResult = {
  text: string;
  normalizedText: string;
  normalizedLines: string[];
  blocks?: OcrBlock[];
  lines?: OcrLine[];
};

export type OcrOptions = {
  includeBlocks?: boolean;
  includeLines?: boolean;
  includeElements?: boolean;
};

type MlKitPoint = {
  x: number;
  y: number;
};

type MlKitFrame = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type MlKitElement = {
  text: string;
  frame?: MlKitFrame;
  cornerPoints?: MlKitPoint[];
};

type MlKitLine = {
  text: string;
  frame?: MlKitFrame;
  cornerPoints?: MlKitPoint[];
  elements?: MlKitElement[];
};

type MlKitBlock = {
  text: string;
  frame?: MlKitFrame;
  cornerPoints?: MlKitPoint[];
  lines?: MlKitLine[];
};

type MlKitResult = {
  text?: string;
  blocks?: MlKitBlock[];
};

function ensureFileUri(value: string) {
  if (value.startsWith('file://') || value.startsWith('content://')) {
    return value;
  }

  if (value.startsWith('/')) {
    return `file://${value}`;
  }

  return value;
}

function mapElement(element: MlKitElement): OcrElement {
  return {
    text: element.text,
    frame: element.frame,
    cornerPoints: element.cornerPoints,
  };
}

function mapLine(line: MlKitLine, includeElements: boolean): OcrLine {
  return {
    text: line.text,
    frame: line.frame,
    cornerPoints: line.cornerPoints,
    elements: includeElements && line.elements ? line.elements.map(mapElement) : undefined,
  };
}

function mapBlock(block: MlKitBlock, includeLines: boolean, includeElements: boolean): OcrBlock {
  return {
    text: block.text,
    frame: block.frame,
    cornerPoints: block.cornerPoints,
    lines: includeLines && block.lines
      ? block.lines.map((line) => mapLine(line, includeElements))
      : undefined,
  };
}

function extractLines(blocks: MlKitBlock[], includeElements: boolean): OcrLine[] {
  const lines: OcrLine[] = [];

  for (const block of blocks) {
    if (!block.lines) {
      continue;
    }

    for (const line of block.lines) {
      lines.push(mapLine(line, includeElements));
    }
  }

  return lines;
}

function normalizeOcrText(text: string) {
  const collapsed = text.replace(/[\t\f\v]+/g, ' ').replace(/[ ]{2,}/g, ' ');
  const rawLines = collapsed.split(/\r?\n/);
  const normalizedLines = rawLines
    .map((line) => line.trim().replace(/[ ]{2,}/g, ' '))
    .filter((line) => line.length > 0);
  const normalizedText = normalizedLines.join('\n');

  return { normalizedText, normalizedLines };
}

export async function runMlKitOcr(
  imageUri: string,
  options: OcrOptions = {}
): Promise<OcrResult> {
  const resolvedUri = ensureFileUri(imageUri);
  const result = (await TextRecognition.recognize(resolvedUri)) as MlKitResult;
  const text = result?.text ?? '';
  const includeBlocks = options.includeBlocks ?? false;
  const includeLines = options.includeLines ?? false;
  const includeElements = options.includeElements ?? false;
  const { normalizedText, normalizedLines } = normalizeOcrText(text);

  const response: OcrResult = { text, normalizedText, normalizedLines };

  if (includeBlocks && result?.blocks) {
    response.blocks = result.blocks.map((block) =>
      mapBlock(block, includeLines, includeElements)
    );
  }

  if (includeLines && result?.blocks) {
    response.lines = extractLines(result.blocks, includeElements);
  }

  return response;
}

export function runMlKitOcrOnCroppedImage(
  croppedImage: CroppedImage,
  options: OcrOptions = {}
): Promise<OcrResult> {
  return runMlKitOcr(croppedImage.uri, options);
}