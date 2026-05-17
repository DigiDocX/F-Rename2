/**
 * app/(tabs)/index.tsx
 *
 * AceScanner — Three-phase PDF discovery & rename pipeline.
 *
 *  Phase 1 — Instant Discovery  : native MediaStore query via AceScannerModule
 *  Phase 2 — UI Isolation       : FlatList renders metadata immediately
 *  Phase 3 — NLP Queue          : sequential local on-device rename processing
 */

import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { discoverPDFs, type DiscoveredPdf, type PdfStatus } from '@/lib/media-query';
import { runNlpRenameQueue, type NlpItemUpdate } from '@/lib/bulk-ocr';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getStatusColor(status: PdfStatus): string {
  switch (status) {
    case 'Processing...':              return '#F59E0B';
    case 'Processed':                  return '#10B981';
    case 'Failed':                     return '#EF4444';
    case 'Pending Local Processing...':
    default:                           return '#64748B';
  }
}

// ─── List Item ────────────────────────────────────────────────────────────────

type ListItemProps = { 
  item: DiscoveredPdf; 
  activeTab: 'Original' | 'Suggested';
};

function PdfListItem({ item, activeTab }: ListItemProps) {
  const statusColor = getStatusColor(item.status);

  return (
    <View style={styles.card}>
      {/* Row 1: filename + status badge */}
      <View style={styles.cardHeader}>
        <Text style={styles.fileName} numberOfLines={1}>
          {item.name}
        </Text>
        <View style={[styles.statusBadge, { borderColor: statusColor }]}>
          <Text style={[styles.statusText, { color: statusColor }]}>
            {item.status}
          </Text>
        </View>
      </View>

      {/* Row 2: physical path */}
      <Text style={styles.fileUri} numberOfLines={1}>
        {item.uri}
      </Text>

      {/* Row 3: suggested rename target */}
      {activeTab === 'Suggested' && (
        <View style={styles.renameRow}>
          <Text style={styles.renameLabel}>Suggested Rename Target</Text>
          <View style={styles.renameActionRow}>
            <Text style={styles.renameValue}>
              {item.suggestedTitle ?? '—'}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const [pdfs,        setPdfs]        = useState<DiscoveredPdf[]>([]);
  const [isScanning,  setIsScanning]  = useState(false);
  const [isProcessing,setIsProcessing]= useState(false);
  const [elapsedMs,   setElapsedMs]   = useState<number | null>(null);
  const [queueIndex,  setQueueIndex]  = useState(0);
  const [activeTab,   setActiveTab]   = useState<'Original' | 'Suggested'>('Original');

  // Stable ref so the NLP queue closure always reads the latest pdfs length
  const pdfCountRef = useRef(0);

  // ── Phase 1: Instant Discovery ─────────────────────────────────────────────
  const handleAceScan = useCallback(async () => {
    if (isScanning || isProcessing) return;

    setIsScanning(true);
    setElapsedMs(null);
    setPdfs([]);
    setQueueIndex(0);

    const t0 = Date.now();
    const discovered = await discoverPDFs();
    const elapsed = Date.now() - t0;

    pdfCountRef.current = discovered.length;

    // ── Phase 2: Immediately render the metadata list ─────────────────────
    setPdfs(discovered);
    setElapsedMs(elapsed);
    setIsScanning(false);

    if (discovered.length === 0) return;

    // ── Phase 3: Kick off the sequential NLP queue ────────────────────────
    setIsProcessing(true);

    const onItemUpdate = (update: NlpItemUpdate) => {
      setPdfs((prev) =>
        prev.map((p) =>
          p.id === update.id
            ? { ...p, status: update.status, suggestedTitle: update.suggestedTitle }
            : p
        )
      );
      setQueueIndex((i) => i + 1);
    };

    await runNlpRenameQueue(discovered, onItemUpdate);
    setIsProcessing(false);
  }, [isScanning, isProcessing]);

  // ── Derived UI state ───────────────────────────────────────────────────────
  const totalCount   = pdfs.length;
  const processedCount = pdfs.filter(
    (p) => p.status === 'Processed' || p.status === 'Failed'
  ).length;

  const buttonLabel = isScanning
    ? 'Scanning…'
    : isProcessing
    ? `Processing ${processedCount}/${totalCount}`
    : 'Trigger Ace Scan';

  const buttonDisabled = isScanning || isProcessing;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>

        {/* ── Header ── */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>AceScanner</Text>
          {elapsedMs !== null && (
            <Text style={styles.headerSub}>
              {totalCount} PDF{totalCount !== 1 ? 's' : ''} found in {elapsedMs} ms
            </Text>
          )}
          {isProcessing && (
            <Text style={styles.headerSub}>
              NLP queue: {processedCount}/{totalCount} processed
            </Text>
          )}
        </View>

        {/* ── Tabs ── */}
        <View style={styles.tabsContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'Original' && styles.activeTab]}
            onPress={() => setActiveTab('Original')}
          >
            <Text style={[styles.tabText, activeTab === 'Original' && styles.activeTabText]}>Original Names</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'Suggested' && styles.activeTab]}
            onPress={() => setActiveTab('Suggested')}
          >
            <Text style={[styles.tabText, activeTab === 'Suggested' && styles.activeTabText]}>Suggested Names</Text>
          </TouchableOpacity>
        </View>

        {/* ── PDF List — Phase 2 ── */}
        <FlatList
          data={activeTab === 'Original' ? pdfs : pdfs.filter(p => p.suggestedTitle || p.status === 'Processing...' || p.status === 'Failed')}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <PdfListItem item={item} activeTab={activeTab} />}
          contentContainerStyle={styles.listContent}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={5}
          ListEmptyComponent={
            isScanning ? null : (
              <Text style={styles.emptyText}>
                No PDFs discovered yet.{'\n'}Tap "Trigger Ace Scan" to begin.
              </Text>
            )
          }
        />

        {/* ── Scan Button ── */}
        <TouchableOpacity
          style={[styles.button, buttonDisabled && styles.buttonDisabled]}
          onPress={handleAceScan}
          disabled={buttonDisabled}
          activeOpacity={0.8}
        >
          {(isScanning || isProcessing) && (
            <ActivityIndicator
              color="#fff"
              size="small"
              style={styles.spinner}
            />
          )}
          <Text style={styles.buttonText}>{buttonLabel}</Text>
        </TouchableOpacity>

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

  // ── Header
  header: {
    gap: 4,
  },
  headerTitle: {
    color: '#F8FAFC',
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  headerSub: {
    color: '#94A3B8',
    fontSize: 13,
  },

  // ── Tabs
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#0F172A',
    borderRadius: 8,
    padding: 4,
    marginBottom: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 6,
  },
  activeTab: {
    backgroundColor: '#1E293B',
  },
  tabText: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '600',
  },
  activeTabText: {
    color: '#F8FAFC',
  },

  // ── List
  listContent: {
    paddingBottom: 24,
    gap: 12,
    flexGrow: 1,
  },
  emptyText: {
    color: '#475569',
    textAlign: 'center',
    marginTop: 60,
    fontSize: 14,
    lineHeight: 22,
  },

  // ── Card
  card: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1E293B',
    gap: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  fileName: {
    color: '#E2E8F0',
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
  fileUri: {
    color: '#64748B',
    fontSize: 11,
  },
  statusBadge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  renameRow: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    gap: 4,
  },
  renameLabel: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '600',
  },
  renameActionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  renameValue: {
    color: '#60A5FA',
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
    textAlign: 'right',
  },

  // ── Button
  button: {
    backgroundColor: '#3B82F6',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    elevation: 3,
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
  },
  buttonDisabled: {
    backgroundColor: '#1E3A5F',
    elevation: 0,
    shadowOpacity: 0,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  spinner: {
    // displayed inline next to button text
  },
});
