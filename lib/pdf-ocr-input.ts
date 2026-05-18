import { cropImageTopPercent, type CroppedImage } from './pdf-page-crop';
import { renderPdfPageToImage, type RenderedPdfPage } from './pdf-page-image';

export type PdfOcrInput = {
  pageImage: RenderedPdfPage;
  croppedImage: CroppedImage;
};

export type PdfOcrInputOptions = {
  dpi?: number;
  page?: number;
  cropPercent?: number;
};

export async function buildPdfOcrInput(
  pdfUri: string,
  pdfName: string,
  options: PdfOcrInputOptions = {}
): Promise<PdfOcrInput> {
  const pageImage = await renderPdfPageToImage(pdfUri, pdfName, {
    dpi: options.dpi,
    page: options.page,
  });

  const croppedImage = await cropImageTopPercent(
    pageImage.uri,
    pageImage.name,
    options.cropPercent
  );

  return { pageImage, croppedImage };
}
