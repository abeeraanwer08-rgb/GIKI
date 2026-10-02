import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { MAX_PAGES } from './scanType';

/**
 * Lets the user choose existing photos. Returns their URIs (empty if they cancelled).
 * The system photo picker needs no permission prompt on current iOS and Android.
 * `multiple` is for documents that can span pages (statements, invoices).
 */
export async function pickPhotosFromGallery(multiple = false): Promise<string[]> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.85,
    allowsEditing: false,
    allowsMultipleSelection: multiple,
    selectionLimit: multiple ? MAX_PAGES : 1,
  });
  if (result.canceled) return [];
  return result.assets.map((asset) => asset.uri);
}

/** Single photo, or null if cancelled — the original helper, kept for the camera screen. */
export async function pickReceiptFromGallery(): Promise<string | null> {
  return (await pickPhotosFromGallery(false))[0] ?? null;
}

/** Lets the user choose a PDF (or an image file). Returns its URI, or null if they cancelled. */
export async function pickPdfOrImageFile(): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/pdf', 'image/*'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled || result.assets.length === 0) return null;
  return result.assets[0].uri;
}

export function isPdfUri(uri: string): boolean {
  return uri.split('?')[0].toLowerCase().endsWith('.pdf');
}
