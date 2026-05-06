import { StyleSheet, View } from 'react-native';

import { ImageTester } from '@/components/ImageTester';

export default function ImagesScreen() {
  return (
    <View style={styles.container}>
      <ImageTester />
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
