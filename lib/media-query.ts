import { Platform } from 'react-native';
import * as MediaLibrary from 'expo-media-library';

export type DiscoveredPdf = {
  uri: string;
  name: string;
  status: string;
  suggestedTitle: string | null;
};

const PENDING_STATUS = 'Pending Local Processing...';

function isPdfName(name?: string | null): boolean {
  if (!name) {
    return false;
  }
  return name.toLowerCase().endsWith('.pdf');
}

export async function discoverPDFs(): Promise<DiscoveredPdf[]> {
  if (Platform.OS !== 'android') {
    return [];
  }

  const existing = await MediaLibrary.getPermissionsAsync();
  if (!existing.granted) {
    const requested = await MediaLibrary.requestPermissionsAsync();
    if (!requested.granted) {
      return [];
    }
  }

  const results: DiscoveredPdf[] = [];
  let after: string | undefined;
  let hasNextPage = true;

  // Paginate through MediaStore results without directory traversal.
  while (hasNextPage) {
    const page = await MediaLibrary.getAssetsAsync({
      first: 1000,
      after,
      mediaType: [MediaLibrary.MediaType.unknown],
      sortBy: [MediaLibrary.SortBy.creationTime],
    });

    for (const asset of page.assets) {
      if (!isPdfName(asset.filename)) {
        continue;
      }

      const info = await MediaLibrary.getAssetInfoAsync(asset);
      const uri = info.localUri ?? asset.uri;

      results.push({
        uri,
        name: asset.filename ?? 'document.pdf',
        status: PENDING_STATUS,
        suggestedTitle: null,
      });
    }

    hasNextPage = page.hasNextPage;
    after = page.endCursor ?? undefined;
  }

  return results;
}
