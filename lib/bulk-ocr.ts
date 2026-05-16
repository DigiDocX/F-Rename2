/**
 * lib/bulk-ocr.ts
 *
 * Phase 3 — Asynchronous Sequential Local NLP Queue.
 *
 * For each discovered PDF:
 *   1. Read the first 1,000 characters via expo-file-system (tiny memory footprint)
 *   2. Strip binary headers, control codes, and null bytes
 *   3. Run compromise.js locally on-device to extract key Nouns/Topics
 *   4. Build a sanitized rename target (alphanumeric + underscores, ≤30 chars)
 *   5. Physically rename the file via FileSystem.moveAsync
 *   6. Broadcast a MediaScanner signal so the new name registers system-wide
 *   7. Yield 50 ms between iterations to let the JS engine GC working buffers
 */

import * as FileSystem from 'expo-file-system';
import { NativeModules } from 'react-native';
import nlp from 'compromise';

import type { DiscoveredPdf, PdfStatus } from '@/lib/media-query';

const { AceScannerModule } = NativeModules;

// ─── Types ────────────────────────────────────────────────────────────────────

export type NlpItemUpdate = {
  id: string;
  status: PdfStatus;
  suggestedTitle: string | null;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const READ_LENGTH      = 1000;   // chars to read from each PDF
const MAX_NAME_LENGTH  = 30;     // max alphanumeric chars before ".pdf"
const YIELD_DELAY_MS   = 50;     // breathing room between iterations

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Strips null bytes, binary control codes (0x00-0x1F except \t and \n),
 * and non-printable high characters from a raw text chunk.
 */
function cleanBinaryText(raw: string): string {
  return raw
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Reads exactly the first READ_LENGTH bytes of a file URI as a UTF-8 string.
 * Falls back to an empty string on binary-only or inaccessible files.
 */
async function readFirstChunk(fileUri: string): Promise<string> {
  try {
    return await FileSystem.readAsStringAsync(fileUri, {
      encoding: 'utf8',   // EncodingType enum removed in expo-file-system v19
      length: READ_LENGTH,
      position: 0,
    });
  } catch {
    // Binary-only PDF or access denied — degrade gracefully
    return '';
  }
}

/**
 * Builds a sanitized filename:
 *   - alphanumeric characters and underscores only
 *   - collapsed/trimmed underscores
 *   - truncated to MAX_NAME_LENGTH chars
 *   - ".pdf" appended
 */
function buildSanitizedFilename(nouns: string[]): string {
  const joined = nouns
    .join('_')
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');

  const base = (joined || 'renamed_document').slice(0, MAX_NAME_LENGTH);
  return base + '.pdf';
}

/**
 * Fires a MediaScanner broadcast for the given absolute path so the system
 * media index reflects the new filename immediately after rename.
 */
async function broadcastMediaScan(absolutePath: string): Promise<void> {
  try {
    if (AceScannerModule?.scanFile) {
      await AceScannerModule.scanFile(absolutePath);
    }
  } catch {
    // Non-critical — the OS will re-index eventually
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Iterates through the discovered PDF list sequentially, one at a time.
 * Calls `onItemUpdate` after each file is processed so the UI reflects
 * live status changes without waiting for the full queue to finish.
 *
 * @param pdfs          — array returned by discoverPDFs()
 * @param onItemUpdate  — callback to update a single item's state in the UI
 */
export async function runNlpRenameQueue(
  pdfs: DiscoveredPdf[],
  onItemUpdate: (update: NlpItemUpdate) => void
): Promise<void> {
  for (const pdf of pdfs) {
    // ── Signal "Processing..." immediately for this file ─────────────────
    onItemUpdate({ id: pdf.id, status: 'Processing...', suggestedTitle: null });

    try {
      // ── Step 1: Read first 1,000 chars (low memory footprint) ──────────
      const rawChunk  = await readFirstChunk(pdf.uri);
      const cleanText = cleanBinaryText(rawChunk);

      // ── Step 2: Local on-device NLP noun extraction ────────────────────
      const doc   = nlp(cleanText);
      const nouns = (doc.nouns().out('array') as string[])
        .filter((n: string) => n.length > 2)
        .slice(0, 6);

      // Fall back to the original filename stem if NLP yields nothing
      const candidates =
        nouns.length > 0
          ? nouns
          : [pdf.name.replace(/\.pdf$/i, '')];

      // ── Step 3: Build sanitized rename target ──────────────────────────
      const suggestedFilename = buildSanitizedFilename(candidates);

      // ── Step 4: Physical rename on disk ────────────────────────────────
      const dir     = pdf.path.substring(0, pdf.path.lastIndexOf('/') + 1);
      const newPath = dir + suggestedFilename;
      const newUri  = 'file://' + newPath;

      await FileSystem.moveAsync({ from: pdf.uri, to: newUri });

      // ── Step 5: Broadcast so MediaStore registers the new filename ─────
      await broadcastMediaScan(newPath);

      // ── Step 6: Report success to the UI ──────────────────────────────
      onItemUpdate({
        id: pdf.id,
        status: 'Processed',
        suggestedTitle: suggestedFilename,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      console.warn(`[nlp-queue] Failed to rename "${pdf.name}":`, msg);
      onItemUpdate({ id: pdf.id, status: 'Failed', suggestedTitle: null });
    }

    // ── Step 7: Yield 50 ms — allow JS engine to clear working buffers ──
    await sleep(YIELD_DELAY_MS);
  }
}
