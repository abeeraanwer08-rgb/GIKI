import * as ImagePicker from 'expo-image-picker';

/**
 * Lets the user choose an existing photo. Returns its URI, or null if they cancelled.
 * The system photo picker needs no permission prompt on current iOS and Android.
 */
export async function pickReceiptFromGallery(): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.85,
    allowsEditing: false,
  });
  if (result.canceled || result.assets.length === 0) return null;
  return result.assets[0].uri;
}
