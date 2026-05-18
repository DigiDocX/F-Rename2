import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { Directory, File, Paths } from 'expo-file-system';
import { Image } from 'react-native';

export type CroppedImage = {
  name: string;
  uri: string;
  size?: number;
  width: number;
  height: number;
  percent: number;
};

const PDF_CROP_DIRECTORY = new Directory(Paths.cache, 'pdf-crop-cache');

function normalizeFileSegment(value: string) {
  const cleaned = value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');

  return cleaned.length > 0 ? cleaned : 'image';
}

function stripExtension(fileName: string) {
  return fileName.replace(/\.[^/.]+$/, '');
}

function getDestinationImage(sourceName: string, percent: number) {
  const baseName = normalizeFileSegment(stripExtension(sourceName));
  const percentLabel = Math.round(percent * 100);

  return new File(PDF_CROP_DIRECTORY, `${baseName}-top-${percentLabel}.jpg`);
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

function getImageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      (error) => reject(error)
    );
  });
}

export async function cropImageTopPercent(
  sourceUri: string,
  sourceName: string,
  percent = 0.25
): Promise<CroppedImage> {
  const clampedPercent = Math.max(0.01, Math.min(1, percent));
  const resolvedUri = ensureFileUri(sourceUri);

  const { width, height } = await getImageSize(resolvedUri);
  const cropHeight = Math.max(1, Math.floor(height * clampedPercent));

  PDF_CROP_DIRECTORY.create({ intermediates: true, idempotent: true });

  const result = await manipulateAsync(
    resolvedUri,
    [
      {
        crop: {
          originX: 0,
          originY: 0,
          width,
          height: cropHeight,
        },
      },
    ],
    {
      compress: 1,
      format: SaveFormat.JPEG,
    }
  );

  const destinationImage = getDestinationImage(sourceName, clampedPercent);
  const sourceImage = new File(ensureFileUri(result.uri));

  if (destinationImage.exists) {
    destinationImage.delete();
  }

  sourceImage.copy(destinationImage);

  return {
    name: destinationImage.name,
    uri: destinationImage.uri,
    size: destinationImage.size,
    width: result.width,
    height: result.height,
    percent: clampedPercent,
  };
}
