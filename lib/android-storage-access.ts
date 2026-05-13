import { Linking, Platform } from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';
import { Directory } from 'expo-file-system';
import Constants from 'expo-constants';

type AllFilesAccessStatus = 'granted' | 'blocked' | 'denied' | 'opened-settings' | 'unavailable';

const EXTERNAL_STORAGE_ROOT = 'file:///storage/emulated/0/';

function getAndroidPackageName() {
  return Constants.expoConfig?.android?.package ?? Constants.manifest?.android?.package;
}

/**
 * Ground-truth check for MANAGE_EXTERNAL_STORAGE.
 *
 * WHY NOT react-native-permissions:
 *   MANAGE_EXTERNAL_STORAGE is a special app access permission, not a standard
 *   runtime permission. Android's PackageManager.checkPermission() always returns
 *   DENIED for it — the only correct check is Environment.isExternalStorageManager().
 *   We approximate that by actually trying to list /storage/emulated/0 using the
 *   expo-file-system v19 Directory API, which calls native code under the hood.
 *
 * Returns 'granted' if we can successfully list /storage/emulated/0.
 * Returns 'denied'  if the listing throws (permission denied or path error).
 * Returns 'unavailable' on iOS or Android < 11 (API 30).
 */
export async function checkAllFilesAccess(): Promise<AllFilesAccessStatus> {
  if (Platform.OS !== 'android') {
    return 'unavailable';
  }

  // Below API 30, READ_EXTERNAL_STORAGE is sufficient and auto-granted at install.
  if (Platform.Version < 30) {
    return 'granted';
  }

  try {
    // expo-file-system v19: Directory.list() is synchronous and throws on access denial
    const storageDir = new Directory(EXTERNAL_STORAGE_ROOT);
    const entries = storageDir.list();
    // Any non-exception result (even empty array) means we have access
    if (Array.isArray(entries) || entries != null) {
      return 'granted';
    }
    return 'denied';
  } catch {
    return 'denied';
  }
}

export async function openAllFilesAccessSettings(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return false;
  }

  const packageName = getAndroidPackageName();

  // 1. Try app-specific All Files Access settings (best UX — takes you straight to the toggle)
  if (packageName) {
    try {
      await IntentLauncher.startActivityAsync(
        'android.settings.MANAGE_APP_ALL_FILES_ACCESS_PERMISSION',
        { data: `package:${packageName}` }
      );
      return true;
    } catch {
      // Some OEMs (OPPO/OnePlus/Xiaomi) don't support this intent — fall through
    }
  }

  // 2. Global All Files Access list
  try {
    await IntentLauncher.startActivityAsync(
      'android.settings.MANAGE_ALL_FILES_ACCESS_PERMISSION',
      {}
    );
    return true;
  } catch {
    // ignore
  }

  // 3. Last resort: system settings home
  try {
    await IntentLauncher.startActivityAsync('android.settings.SETTINGS', {});
    return true;
  } catch {
    // ignore
  }

  return false;
}

export async function ensureAllFilesAccess(): Promise<AllFilesAccessStatus> {
  const status = await checkAllFilesAccess();
  if (status === 'granted' || status === 'unavailable') {
    return status;
  }

  const opened = await openAllFilesAccessSettings();
  return opened ? 'opened-settings' : 'unavailable';
}
