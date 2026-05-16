import { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { discoverPDFs, type DiscoveredPdf } from '@/lib/media-query';

type StatusKind = 'Pending Local Processing...' | 'Processing...' | 'Processed' | 'Failed';

function getStatusColor(status: StatusKind): string {
  switch (status) {
    case 'Processing...':
      return '#F59E0B';
    case 'Processed':
      return '#10B981';
    case 'Failed':
      return '#EF4444';
    default:
      return '#64748B';
  }
}

function getRenameTargetLabel(suggestedTitle: string | null): string {
  return suggestedTitle ? suggestedTitle : '—';
}

type ListItemProps = {
  item: DiscoveredPdf;
};

function PdfListItem({ item }: ListItemProps) {
  const status = item.status as StatusKind;
  const statusColor = getStatusColor(status);

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.fileName}>{item.name}</Text>
        <View style={[styles.statusBadge, { borderColor: statusColor }]}
          >
          <Text style={[styles.statusText, { color: statusColor }]}>{status}</Text>
        </View>
      </View>
      <Text style={styles.fileUri}>{item.uri}</Text>
      <View style={styles.renameRow}>
        <Text style={styles.renameLabel}>Rename Target</Text>
        <Text style={styles.renameValue}>{getRenameTargetLabel(item.suggestedTitle)}</Text>
      </View>
    </View>
  );
}

export default function HomeScreen() {
  const [pdfs, setPdfs] = useState<DiscoveredPdf[]>([]);

  const handleDiscover = useCallback(async () => {
    const discovered = await discoverPDFs();
    setPdfs(discovered);
  }, []);

  const data = useMemo(() => pdfs, [pdfs]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <TouchableOpacity style={styles.button} onPress={handleDiscover}>
          <Text style={styles.buttonText}>Trigger Ace Scan</Text>
        </TouchableOpacity>

        <FlatList
          data={data}
          keyExtractor={(item) => item.uri}
          renderItem={({ item }) => <PdfListItem item={item} />}
          contentContainerStyle={styles.listContent}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={5}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No PDFs discovered yet.</Text>
          }
        />
      </View>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#020617',
  },
  container: {
    flex: 1,
    padding: 20,
    gap: 16,
  },
  button: {
    backgroundColor: '#3B82F6',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  listContent: {
    paddingBottom: 24,
    gap: 12,
  },
  emptyText: {
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 32,
  },
  card: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  fileName: {
    color: '#E2E8F0',
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  fileUri: {
    color: '#94A3B8',
    marginTop: 6,
    fontSize: 12,
  },
  statusBadge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  renameRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  renameLabel: {
    color: '#CBD5F5',
    fontSize: 12,
    fontWeight: '600',
  },
  renameValue: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '500',
  },
});
