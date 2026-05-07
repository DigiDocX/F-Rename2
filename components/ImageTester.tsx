import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  buildFilenameFromEntities,
  compromiseExtractEntities,
  pickTopEntityCandidates,
  scoreExtractedEntities,
  type ExtractedEntity,
  type ScoredEntity,
} from '@/constants/entity-extraction';
import { runMlKitOcrOnCroppedImage } from '@/lib/pdf-ocr';
import { cropImageTopPercent, type CroppedImage } from '@/lib/pdf-page-crop';

const CROP_PERCENT = 0.5;

type PickedImage = {
  uri: string;
  name: string;
  size?: number;
  width?: number;
  height?: number;
};

function getPickedImage(result: ImagePicker.ImagePickerResult): PickedImage | null {
  if (result.canceled) {
    return null;
  }

  if ('assets' in result && result.assets && result.assets.length > 0) {
    const asset = result.assets[0];

    return {
      uri: asset.uri,
      name: asset.fileName ?? `image-${Date.now()}.jpg`,
      size: asset.fileSize,
      width: asset.width,
      height: asset.height,
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

function formatDimensions(width?: number, height?: number) {
  if (!width || !height) {
    return 'Unknown dimensions';
  }

  return `${width} x ${height}`;
}

export function ImageTester() {
  const [pickedImage, setPickedImage] = useState<PickedImage | null>(null);
  const [croppedImage, setCroppedImage] = useState<CroppedImage | null>(null);
  const [ocrText, setOcrText] = useState('');
  const [entities, setEntities] = useState<ExtractedEntity[]>([]);
  const [topEntities, setTopEntities] = useState<ScoredEntity[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const cropPercentLabel = useMemo(() => Math.round(CROP_PERCENT * 100), []);
  const suggestedFilename = useMemo(
    () => buildFilenameFromEntities(topEntities, 60),
    [topEntities]
  );

  const resetResults = useCallback(() => {
    setCroppedImage(null);
    setOcrText('');
    setEntities([]);
    setTopEntities([]);
  }, []);

  const handleClearImage = useCallback(() => {
    setPickedImage(null);
    resetResults();
    setErrorMessage(null);
  }, [resetResults]);

  const handlePickFromLibrary = useCallback(async () => {
    setErrorMessage(null);

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') {
      setErrorMessage('Media library permission is required to pick images.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
      allowsEditing: false,
    });

    const image = getPickedImage(result);
    if (!image) {
      return;
    }

    setPickedImage(image);
    resetResults();
  }, [resetResults]);

  const handleCapturePhoto = useCallback(async () => {
    setErrorMessage(null);

    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (permission.status !== 'granted') {
      setErrorMessage('Camera permission is required to capture images.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
      allowsEditing: false,
    });

    const image = getPickedImage(result);
    if (!image) {
      return;
    }

    setPickedImage(image);
    resetResults();
  }, [resetResults]);

  const handleRunOcr = useCallback(async () => {
    if (!pickedImage) {
      setErrorMessage('Pick or capture an image before running OCR.');
      return;
    }

    setIsRunning(true);
    setErrorMessage(null);

    try {
      const cropped = await cropImageTopPercent(pickedImage.uri, pickedImage.name, CROP_PERCENT);
      setCroppedImage(cropped);

      const result = await runMlKitOcrOnCroppedImage(cropped, {
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
  }, [pickedImage]);

  return (
    <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      <Text style={styles.title}>Image OCR</Text>
      <Text style={styles.description}>
        Pick an image or capture a photo. OCR uses the top {cropPercentLabel}% of the image.
      </Text>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Source Image</Text>
        <Text style={styles.secondaryText}>
          {pickedImage ? pickedImage.name : 'No image selected yet.'}
        </Text>
        <Text style={styles.tertiaryText}>
          {pickedImage
            ? `${formatBytes(pickedImage.size)} · ${formatDimensions(
                pickedImage.width,
                pickedImage.height
              )}`
            : 'Pick an image to continue.'}
        </Text>
        <View style={styles.buttonRow}>
          <Pressable style={styles.primaryButton} onPress={handlePickFromLibrary}>
            <Text style={styles.primaryButtonText}>Pick Image</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={handleCapturePhoto}>
            <Text style={styles.secondaryButtonText}>Capture Photo</Text>
          </Pressable>
        </View>
        {pickedImage ? (
          <Pressable style={styles.ghostButton} onPress={handleClearImage}>
            <Text style={styles.ghostButtonText}>Clear selection</Text>
          </Pressable>
        ) : null}
      </View>

      {pickedImage ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Original Preview</Text>
          <Image source={{ uri: pickedImage.uri }} style={styles.previewImage} />
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>OCR</Text>
        <Text style={styles.secondaryText}>Crop: top {cropPercentLabel}% of the image.</Text>
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

      {croppedImage ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Cropped Preview</Text>
          <Image source={{ uri: croppedImage.uri }} style={styles.previewImage} />
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

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Suggested Filename</Text>
        <Text style={styles.secondaryText}>{suggestedFilename}</Text>
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
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  primaryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#2563EB',
    flex: 1,
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
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    flex: 1,
  },
  secondaryButtonText: {
    color: '#CBD5E1',
    fontWeight: '500',
  },
  ghostButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  ghostButtonText: {
    color: '#94A3B8',
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
