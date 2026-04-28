import * as DocumentPicker from 'expo-document-picker';
import ExpoPdfToImageModule from 'expo-pdf-to-image';
import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Directory, File, Paths } from 'expo-file-system';

type SelectedPdf = {
  name: string;
  uri: string;
  size?: number;
  mimeType?: string;
};

type ConvertedJpg = {
  name: string;
  uri: string;
  size?: number;
};

const PDF_PICKER_OPTIONS = {
  copyToCacheDirectory: true,
  multiple: false,
  type: 'application/pdf' as const,
};

const PDF_IMAGE_DIRECTORY = new Directory(Paths.cache, 'pdf-tester');

function normalizeFileSegment(value: string) {
  const cleaned = value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');

  return cleaned.length > 0 ? cleaned : 'pdf';
}

function stripExtension(fileName: string) {
  return fileName.replace(/\.[^/.]+$/, '');
}

function getPdfName(assetName?: string) {
  return assetName && assetName.trim().length > 0 ? assetName.trim() : 'selected-pdf.pdf';
}

function getDestinationImage(sourcePdfName: string) {
  const baseName = normalizeFileSegment(stripExtension(sourcePdfName));

  return new File(PDF_IMAGE_DIRECTORY, `${baseName}-page-1.jpg`);
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

function readPickedPdf(result: DocumentPicker.DocumentPickerResult): SelectedPdf | null {
  if (result.canceled || !result.assets || result.assets.length === 0) {
    return null;
  }

  const [asset] = result.assets;

  return {
    name: getPdfName(asset.name),
    uri: asset.uri,
    size: asset.size,
    mimeType: asset.mimeType,
  };
}

async function convertPdfPageToJpg(pdf: SelectedPdf): Promise<ConvertedJpg> {
  if (Platform.OS === 'web') {
    throw new Error('PDF conversion is only supported on native platforms.');
  }

  PDF_IMAGE_DIRECTORY.create({ intermediates: true, idempotent: true });

  const imagePaths = await ExpoPdfToImageModule.convertPdfToImages(pdf.uri);

  if (imagePaths.length === 0) {
    throw new Error('No image was generated from the selected PDF.');
  }

  const sourceImage = new File(ensureFileUri(imagePaths[0]));
  const destinationImage = getDestinationImage(pdf.name);

  if (destinationImage.exists) {
    destinationImage.delete();
  }

  sourceImage.copy(destinationImage);

  return {
    name: destinationImage.name,
    uri: destinationImage.uri,
    size: destinationImage.size,
  };
}

export function PDFTester() {
  const [selectedPdf, setSelectedPdf] = useState<SelectedPdf | null>(null);
  const [convertedJpg, setConvertedJpg] = useState<ConvertedJpg | null>(null);
  const [isPicking, setIsPicking] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [isViewing, setIsViewing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleTestUpload = async () => {
    try {
      setErrorMessage(null);
      setIsPicking(true);
      setIsConverting(false);

      const result = await DocumentPicker.getDocumentAsync(PDF_PICKER_OPTIONS);
      const pickedPdf = readPickedPdf(result);

      if (!pickedPdf) {
        setSelectedPdf(null);
        setConvertedJpg(null);
        return;
      }

      setSelectedPdf(pickedPdf);
      setIsConverting(true);

      const jpg = await convertPdfPageToJpg(pickedPdf);

      setConvertedJpg(jpg);
    } catch (error) {
      setSelectedPdf(null);
      setConvertedJpg(null);
      setErrorMessage(error instanceof Error ? error.message : 'Failed to process the selected PDF.');
    } finally {
      setIsPicking(false);
      setIsConverting(false);
    }
  };

  const handleOpenImage = () => {
    if (!convertedJpg) {
      return;
    }

    setIsViewing(true);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>PDF Tester</Text>
      <Text style={styles.description}>
        Use the button below to select a single PDF. The file is copied to the app cache so it can
        be read immediately by Expo file APIs.
      </Text>

      <Pressable
        accessibilityRole="button"
        onPress={handleTestUpload}
        style={({ pressed }) => [
          styles.button,
          pressed && !isPicking ? styles.buttonPressed : null,
          isPicking ? styles.buttonDisabled : null,
        ]}
        disabled={isPicking}>
        {isPicking ? (
          <View style={styles.buttonContent}>
            <ActivityIndicator color="#FFFFFF" />
            <Text style={styles.buttonLabel}>{isConverting ? 'Converting PDF...' : 'Selecting PDF...'}</Text>
          </View>
        ) : (
          <Text style={styles.buttonLabel}>Test Upload</Text>
        )}
      </Pressable>

      {selectedPdf ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Selected PDF</Text>
          <Text style={styles.cardText}>{selectedPdf.name}</Text>
          <Text style={styles.cardMeta} numberOfLines={1} ellipsizeMode="middle">
            {selectedPdf.uri}
          </Text>
          {typeof selectedPdf.size === 'number' ? (
            <Text style={styles.cardMeta}>{Math.round(selectedPdf.size / 1024)} KB</Text>
          ) : null}
          {selectedPdf.mimeType ? <Text style={styles.cardMeta}>{selectedPdf.mimeType}</Text> : null}
        </View>
      ) : null}

      {convertedJpg ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Cached JPG</Text>
          <Image source={{ uri: convertedJpg.uri }} style={styles.preview} resizeMode="contain" />
          <Text style={styles.cardText}>{convertedJpg.name}</Text>
          <Text style={styles.cardMeta} numberOfLines={1} ellipsizeMode="middle">
            {convertedJpg.uri}
          </Text>
          {typeof convertedJpg.size === 'number' ? (
            <Text style={styles.cardMeta}>{Math.round(convertedJpg.size / 1024)} KB</Text>
          ) : null}
          <Pressable
            accessibilityRole="button"
            onPress={handleOpenImage}
            style={({ pressed }) => [
              styles.openButton,
              pressed ? styles.buttonPressed : null,
            ]}>
            <Text style={styles.openButtonLabel}>View in App</Text>
          </Pressable>
        </View>
      ) : null}

      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
      <Modal
        animationType="slide"
        visible={isViewing}
        onRequestClose={() => setIsViewing(false)}
        presentationStyle="fullScreen">
        <View style={styles.viewerContainer}>
          <View style={styles.viewerHeader}>
            <Text style={styles.viewerTitle}>Cached JPG Preview</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => setIsViewing(false)}
              style={({ pressed }) => [
                styles.viewerClose,
                pressed ? styles.viewerClosePressed : null,
              ]}>
              <Text style={styles.viewerCloseLabel}>Close</Text>
            </Pressable>
          </View>
          {convertedJpg ? (
            <Image source={{ uri: convertedJpg.uri }} style={styles.viewerImage} resizeMode="contain" />
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
    padding: 20,
    backgroundColor: '#0F172A',
    borderRadius: 20,
  },
  title: {
    color: '#F8FAFC',
    fontSize: 24,
    fontWeight: '700',
  },
  description: {
    color: '#CBD5E1',
    fontSize: 14,
    lineHeight: 20,
  },
  button: {
    alignItems: 'center',
    backgroundColor: '#2563EB',
    borderRadius: 14,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 16,
  },
  buttonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonContent: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  buttonLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  card: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    gap: 6,
    padding: 16,
  },
  cardTitle: {
    color: '#E2E8F0',
    fontSize: 16,
    fontWeight: '700',
  },
  cardText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  preview: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    height: 220,
    marginBottom: 8,
    width: '100%',
    alignSelf: 'center',
  },
  openButton: {
    alignItems: 'center',
    backgroundColor: '#0EA5E9',
    borderRadius: 12,
    justifyContent: 'center',
    marginTop: 8,
    minHeight: 44,
    paddingHorizontal: 12,
  },
  openButtonLabel: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  viewerContainer: {
    backgroundColor: '#020617',
    flex: 1,
    padding: 16,
  },
  viewerHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  viewerTitle: {
    color: '#F8FAFC',
    fontSize: 18,
    fontWeight: '700',
  },
  viewerClose: {
    backgroundColor: '#1E293B',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  viewerClosePressed: {
    opacity: 0.85,
  },
  viewerCloseLabel: {
    color: '#E2E8F0',
    fontSize: 14,
    fontWeight: '600',
  },
  viewerImage: {
    backgroundColor: '#0F172A',
    borderRadius: 16,
    flex: 1,
    width: '100%',
    alignSelf: 'center',
  },
  cardMeta: {
    color: '#94A3B8',
    fontSize: 12,
  },
  errorText: {
    color: '#FCA5A5',
    fontSize: 13,
  },
});