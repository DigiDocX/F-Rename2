import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ImageTester } from '@/components/ImageTester';
import { PDFTester } from '@/components/PDFTester';

type EntryTab = 'pdf' | 'image';

export default function HomeScreen() {
  const [activeTab, setActiveTab] = useState<EntryTab>('pdf');
  const title = useMemo(() => (activeTab === 'pdf' ? 'PDF OCR' : 'Image OCR'), [activeTab]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.tabRow}>
        <Pressable
          style={[styles.tabButton, activeTab === 'pdf' && styles.tabButtonActive]}
          onPress={() => setActiveTab('pdf')}>
          <Text style={[styles.tabText, activeTab === 'pdf' && styles.tabTextActive]}>PDF</Text>
        </Pressable>
        <Pressable
          style={[styles.tabButton, activeTab === 'image' && styles.tabButtonActive]}
          onPress={() => setActiveTab('image')}>
          <Text style={[styles.tabText, activeTab === 'image' && styles.tabTextActive]}>
            Image
          </Text>
        </Pressable>
      </View>
      <View style={styles.content}>
        {activeTab === 'pdf' ? <PDFTester /> : <ImageTester />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020617',
    padding: 16,
    gap: 12,
  },
  title: {
    color: '#F8FAFC',
    fontSize: 22,
    fontWeight: '700',
  },
  tabRow: {
    flexDirection: 'row',
    gap: 10,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1E293B',
    backgroundColor: '#0F172A',
  },
  tabButtonActive: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  tabText: {
    color: '#94A3B8',
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#F8FAFC',
  },
  content: {
    flex: 1,
  },
});
