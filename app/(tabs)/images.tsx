import { StyleSheet, Text, View } from 'react-native';

export default function ImagesScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Image Tools</Text>
      <Text style={styles.sub}>
        OCR image tools have been removed in favour of the native{'\n'}
        MediaStore NLP pipeline on the Rename tab.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020617',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  title: {
    color: '#E2E8F0',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 12,
  },
  sub: {
    color: '#475569',
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
  },
});
