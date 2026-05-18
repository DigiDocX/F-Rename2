import * as FileSystem from 'expo-file-system';
import { NativeModules } from 'react-native';

import {
  buildFilenameFromEntities,
  compromiseExtractEntities,
  pickTopEntityCandidates,
  scoreExtractedEntities,
} from '@/constants/entity-extraction';
import type { DiscoveredPdf, PdfStatus } from '@/lib/media-query';

const { AceScannerModule } = NativeModules;

export type PdfRenameItemUpdate = {
  id: string;
  status: PdfStatus;
  suggestedTitle: string | null;
  errorMessage?: string | null;
};

const YIELD_DELAY_MS = 50;
const MAX_FILENAME_LENGTH = 60;
const MAX_COLLISION_TRIES = 15;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureFileUri(value: string) {
  if (value.startsWith('file://') || value.startsWith('content://')) {
    return value;
  }

  if (value.startsWith('/')) {
    return `file://${value}`;
  }

  return value;
}

function stripFileUri(value: string) {
  if (value.startsWith('file://')) {
    return value.slice('file://'.length);
  }

  return value;
}

function getPdfPath(pdf: DiscoveredPdf): string {
  if (pdf.path) {
    return pdf.path;
  }

  return stripFileUri(pdf.uri);
}

function getDirectoryPath(filePath: string): string {
  const lastSlash = filePath.lastIndexOf('/');
  if (lastSlash <= 0) {
    return '';
  }

  return filePath.slice(0, lastSlash);
}

function ensurePdfExtension(name: string): string {
  if (name.toLowerCase().endsWith('.pdf')) {
    return name;
  }

  return `${name}.pdf`;
}

async function pathExists(path: string): Promise<boolean> {
  const info = await FileSystem.getInfoAsync(ensureFileUri(path));
  return info.exists;
}

async function resolveUniquePath(directory: string, filename: string): Promise<string> {
  let candidate = `${directory}/${filename}`;
  if (!(await pathExists(candidate))) {
    return candidate;
  }

  const baseName = filename.replace(/\.pdf$/i, '');
  for (let i = 1; i <= MAX_COLLISION_TRIES; i += 1) {
    const nextName = `${baseName}_${i}.pdf`;
    candidate = `${directory}/${nextName}`;
    if (!(await pathExists(candidate))) {
      return candidate;
    }
  }

  return candidate;
}

async function broadcastMediaScan(absolutePath: string): Promise<void> {
  try {
    if (AceScannerModule?.scanFile) {
      await AceScannerModule.scanFile(absolutePath);
    }
  } catch {
    // Best effort.
  }
}

export async function applyRename(pdf: DiscoveredPdf, newFilename: string): Promise<string> {
  const sourcePath = getPdfPath(pdf);
  const directory = getDirectoryPath(sourcePath);
  const targetPath = await resolveUniquePath(directory, newFilename);

  if (directory && sourcePath && targetPath && sourcePath !== targetPath) {
    if (AceScannerModule?.renameFile) {
       await AceScannerModule.renameFile(pdf.uri, targetPath);
    } else {
       await FileSystem.moveAsync({
         from: ensureFileUri(sourcePath),
         to: ensureFileUri(targetPath),
       });
       await broadcastMediaScan(targetPath);
    }
    return targetPath;
  }
  return sourcePath;
}

export async function runPdfRenameQueue(
  pdfs: DiscoveredPdf[],
  onItemUpdate: (update: PdfRenameItemUpdate) => void
): Promise<void> {
  for (const pdf of pdfs) {
    onItemUpdate({ id: pdf.id, status: 'Processing...', suggestedTitle: null, errorMessage: null });

    try {
      let extractedText = '';
      if (AceScannerModule?.extractPdfText) {
        extractedText = await AceScannerModule.extractPdfText(pdf.uri);
      }

      const baseName = pdf.name.replace(/\.pdf$/i, '');
      const entityInputs = [
        { source: 'ocr' as const, text: extractedText },
        { source: 'metadata' as const, text: baseName },
      ];
      const extracted = compromiseExtractEntities(entityInputs);
      const scored = scoreExtractedEntities(entityInputs, extracted);
      const top = pickTopEntityCandidates(scored, 3);

      const suggestedBase = buildFilenameFromEntities(top, MAX_FILENAME_LENGTH);
      const suggestedFilename = ensurePdfExtension(suggestedBase);

      // We no longer automatically move the file here.
      // We just provide the suggestion to the UI.

      onItemUpdate({
        id: pdf.id,
        status: 'Processed',
        suggestedTitle: suggestedFilename,
        errorMessage: null,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.warn(`[pdf-rename-queue] Failed to process "${pdf.name}":`, message);
      onItemUpdate({
        id: pdf.id,
        status: 'Failed',
        suggestedTitle: null,
        errorMessage: message,
      });
    }

    await sleep(YIELD_DELAY_MS);
  }
}
