import { StyleSheet, View } from 'react-native';

import { PDFTester } from '@/components/PDFTester';

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <PDFTester />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020617',
    padding: 16,
    justifyContent: 'center',
  },
});
