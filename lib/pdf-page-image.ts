import ExpoPdfToImageModule from 'expo-pdf-to-image';
import { Directory, File, Paths } from 'expo-file-system';

export type RenderedPdfPage = {
  name: string;
  uri: string;
  size?: number;
  page: number;
  dpi: number;
};

export type RenderPdfPageOptions = {
  dpi?: number;
  page?: number;
};

const PDF_IMAGE_DIRECTORY = new Directory(Paths.cache, 'pdf-page-cache');

function normalizeFileSegment(value: string) {
  const cleaned = value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');

  return cleaned.length > 0 ? cleaned : 'pdf';
}

function stripExtension(fileName: string) {
  return fileName.replace(/\.[^/.]+$/, '');
}

function getDestinationImage(sourcePdfName: string, page: number) {
  const baseName = normalizeFileSegment(stripExtension(sourcePdfName));

  return new File(PDF_IMAGE_DIRECTORY, `${baseName}-page-${page}.jpg`);
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

export async function renderPdfPageToImage(
  pdfUri: string,
  pdfName: string,
  options: RenderPdfPageOptions = {}
): Promise<RenderedPdfPage> {
  const page = options.page ?? 1;
  const dpi = options.dpi ?? 200;

  PDF_IMAGE_DIRECTORY.create({ intermediates: true, idempotent: true });

  const imagePaths = await (ExpoPdfToImageModule as {
    convertPdfToImages: (uri: string, options?: Record<string, unknown>) => Promise<string[]>;
  }).convertPdfToImages(pdfUri, { dpi, pages: [page] });

  if (imagePaths.length === 0) {
    throw new Error('No image was generated from the selected PDF.');
  }

  const sourceImage = new File(ensureFileUri(imagePaths[0]));
  const destinationImage = getDestinationImage(pdfName, page);

  if (destinationImage.exists) {
    destinationImage.delete();
  }

  sourceImage.copy(destinationImage);

  return {
    name: destinationImage.name,
    uri: destinationImage.uri,
    size: destinationImage.size,
    page,
    dpi,
  };
}
