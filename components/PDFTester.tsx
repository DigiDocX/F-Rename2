import * as DocumentPicker from 'expo-document-picker';
import { Image } from 'expo-image';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  compromiseExtractEntities,
  pickTopEntityCandidates,
  scoreExtractedEntities,
  type ExtractedEntity,
  type ScoredEntity,
} from '@/constants/entity-extraction';
import { runMlKitOcrOnCroppedImage } from '@/lib/pdf-ocr';
import { buildPdfOcrInput } from '@/lib/pdf-ocr-input';

const CROP_PERCENT = 0.25;

type PickedPdf = {
  uri: string;
  name: string;
  size?: number;
};

type PickerAssetWithCopy = DocumentPicker.DocumentPickerAsset & {
  fileCopyUri?: string | null;
  size?: number;
  name?: string | null;
};

function getPickedPdf(result: DocumentPicker.DocumentPickerResult): PickedPdf | null {
  if (result.canceled) {
    return null;
  }

  if ('assets' in result && result.assets && result.assets.length > 0) {
    const asset = result.assets[0] as PickerAssetWithCopy;
    const resolvedUri = asset.fileCopyUri ?? asset.uri;

    return {
      uri: resolvedUri,
      name: asset.name ?? 'document.pdf',
      size: asset.size,
    };
  }

  return null;
}

function formatBytes(size?: number) {
  if (!size || size <= 0) {
    return 'Unknown size';
  }

  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function PDFTester() {
  const [pickedPdf, setPickedPdf] = useState<PickedPdf | null>(null);
  const [croppedImageUri, setCroppedImageUri] = useState<string | null>(null);
  const [ocrText, setOcrText] = useState('');
  const [entities, setEntities] = useState<ExtractedEntity[]>([]);
  const [topEntities, setTopEntities] = useState<ScoredEntity[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const cropPercentLabel = useMemo(() => Math.round(CROP_PERCENT * 100), []);

  const handlePickPdf = useCallback(async () => {
    setErrorMessage(null);

    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/pdf',
      copyToCacheDirectory: true,
      multiple: false,
    });

    const pdf = getPickedPdf(result);
    if (!pdf) {
      return;
    }

    setPickedPdf(pdf);
    setCroppedImageUri(null);
    setOcrText('');
    setEntities([]);
    setTopEntities([]);
  }, []);

  const handleClearPdf = useCallback(() => {
    setPickedPdf(null);
    setCroppedImageUri(null);
    setOcrText('');
    setEntities([]);
    setTopEntities([]);
    setErrorMessage(null);
  }, []);

  const handleRunOcr = useCallback(async () => {
    if (!pickedPdf) {
      setErrorMessage('Pick a PDF before running OCR.');
      return;
    }

    setIsRunning(true);
    setErrorMessage(null);

    try {
      const input = await buildPdfOcrInput(pickedPdf.uri, pickedPdf.name, {
        cropPercent: CROP_PERCENT,
      });

      setCroppedImageUri(input.croppedImage.uri);

      const result = await runMlKitOcrOnCroppedImage(input.croppedImage, {
        includeLines: false,
        includeBlocks: false,
        includeElements: false,
      });

      const normalizedText = result.normalizedText ?? '';
      setOcrText(normalizedText);

      const entityInputs = [{ source: 'ocr' as const, text: normalizedText }];
      const extracted = compromiseExtractEntities(entityInputs);
      const scored = scoreExtractedEntities(entityInputs, extracted);
      const top = pickTopEntityCandidates(scored, 3);

      setEntities(extracted);
      setTopEntities(top);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'OCR failed.';
      setErrorMessage(message);
    } finally {
      setIsRunning(false);
    }
  }, [pickedPdf]);

  return (
    <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      <Text style={styles.title}>PDF OCR Tester</Text>
      <Text style={styles.description}>
        Pick a PDF from your device and extract text from the top {cropPercentLabel}% of the first
        page.
      </Text>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Source PDF</Text>
        <Text style={styles.secondaryText}>{pickedPdf ? pickedPdf.name : 'No PDF selected yet.'}</Text>
        <Text style={styles.tertiaryText}>
          {pickedPdf ? `Ready for OCR · ${formatBytes(pickedPdf.size)}` : 'Pick a PDF to continue.'}
        </Text>
        <Pressable style={styles.primaryButton} onPress={handlePickPdf} disabled={isRunning}>
          <Text style={styles.primaryButtonText}>Pick PDF</Text>
        </Pressable>
        {pickedPdf ? (
          <Pressable style={styles.secondaryButton} onPress={handleClearPdf} disabled={isRunning}>
            <Text style={styles.secondaryButtonText}>Clear selection</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>OCR</Text>
        <Text style={styles.secondaryText}>Crop: top {cropPercentLabel}% of the page.</Text>
        <Pressable
          style={[styles.primaryButton, isRunning && styles.primaryButtonDisabled]}
          onPress={handleRunOcr}
          disabled={isRunning}>
          <Text style={styles.primaryButtonText}>
            {isRunning ? 'Running OCR...' : 'Run OCR'}
          </Text>
        </Pressable>
        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
      </View>

      {croppedImageUri ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Cropped Preview</Text>
          <Image source={{ uri: croppedImageUri }} style={styles.previewImage} />
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>OCR Text</Text>
        <Text style={styles.ocrText}>{ocrText || 'No text yet.'}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Tagged Entities</Text>
        {entities.length === 0 ? (
          <Text style={styles.secondaryText}>No entities tagged yet.</Text>
        ) : (
          <View style={styles.entityList}>
            {entities.map((entity, index) => (
              <View key={`${entity.type}-${entity.text}-${index}`} style={styles.entityRow}>
                <View style={styles.entityTypeBadge}>
                  <Text style={styles.entityTypeText}>{entity.type.toUpperCase()}</Text>
                </View>
                <Text style={styles.entityValueText}>{entity.text}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Top Candidates</Text>
        {topEntities.length === 0 ? (
          <Text style={styles.secondaryText}>Run OCR to score candidates.</Text>
        ) : (
          <View style={styles.entityList}>
            {topEntities.map((entity, index) => (
              <View key={`${entity.type}-${entity.text}-${index}`} style={styles.entityRow}>
                <View style={styles.entityTypeBadge}>
                  <Text style={styles.entityTypeText}>{entity.type.toUpperCase()}</Text>
                </View>
                <View style={styles.entityScoreBlock}>
                  <Text style={styles.entityValueText}>{entity.text}</Text>
                  <Text style={styles.entityScoreText}>Score {entity.score}</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 16,
    backgroundColor: '#020617',
  },
  title: {
    color: '#F8FAFC',
    fontSize: 26,
    fontWeight: '700',
  },
  description: {
    color: '#94A3B8',
    fontSize: 14,
    lineHeight: 20,
  },
  card: {
    gap: 12,
    padding: 16,
    borderRadius: 16,
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  sectionTitle: {
    color: '#E2E8F0',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryText: {
    color: '#94A3B8',
    fontSize: 13,
  },
  tertiaryText: {
    color: '#64748B',
    fontSize: 12,
  },
  primaryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#2563EB',
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: '#F8FAFC',
    fontWeight: '600',
  },
  secondaryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  secondaryButtonText: {
    color: '#CBD5E1',
    fontWeight: '500',
  },
  errorText: {
    color: '#FCA5A5',
    fontSize: 13,
  },
  previewImage: {
    width: '100%',
    height: 220,
    borderRadius: 12,
    backgroundColor: '#0B1120',
  },
  ocrText: {
    color: '#E2E8F0',
    fontSize: 13,
    lineHeight: 18,
  },
  entityList: {
    gap: 10,
  },
  entityRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  entityTypeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: '#1D4ED8',
  },
  entityTypeText: {
    color: '#E2E8F0',
    fontSize: 11,
    fontWeight: '700',
  },
  entityValueText: {
    color: '#E2E8F0',
    fontSize: 13,
    flexShrink: 1,
  },
  entityScoreBlock: {
    flex: 1,
    gap: 4,
  },
  entityScoreText: {
    color: '#94A3B8',
    fontSize: 12,
  },
});