import { StyleSheet, Text, View } from 'react-native';

export function PDFTester() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>PDF Tester</Text>
      <Text style={styles.description}>
        The OCR and entity extraction flow has been removed. This screen is a placeholder while the
        new pipeline is rebuilt from scratch.
      </Text>
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
});