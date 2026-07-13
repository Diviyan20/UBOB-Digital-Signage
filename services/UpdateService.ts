import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Updates from "expo-updates";

const LAST_SEEN_VERSION_KEY = "last_seen_version";

export interface UpdateInfo {
  available: boolean;
  version: string; // From release_notes.json, pushed via OTA
  sizeLabel: string; // From release_notes.json
}

/*
 * Checks expo-updates for a pending OTA update
 * Returns update info sourced from release_notes.json if one is available
 */
export const checkForUpdate = async (
  releaseVersion: string,
  releaseSize: string,
): Promise<UpdateInfo> => {
  try {
    // In Expo Go / dev mode, Updates.isEmbeddedLaunch is always true
    // and checkForUpdateAsync will throw — treat as no update
    if (__DEV__) {
      return {
        available: false,
        version: releaseVersion,
        sizeLabel: releaseSize,
      };
    }

    const result = await Updates.checkForUpdateAsync();

    return {
      available: result.isAvailable,
      version: releaseVersion,
      sizeLabel: releaseSize,
    };
  } catch (err) {
    console.warn("[UPDATE] Check failed: ", err);
    return {
      available: false,
      version: releaseVersion,
      sizeLabel: releaseSize,
    };
  }
};

/*
 * Downloads and applies the OTA update, then restarts the app.
 * Call this when the user taps the Update button.
 */
export const downloadAndApplyUpdate = async (): Promise<void> => {
  await Updates.fetchUpdateAsync();
  await Updates.reloadAsync(); // Restarts the app with the new bundle
};

/*
 * Returns true if the user hasn't seen the release notes for this version yet.
 */
export const shouldShowReleaseNotes = async (
  currentVersion: string,
): Promise<boolean> => {
  try {
    const lastSeen = await AsyncStorage.getItem(LAST_SEEN_VERSION_KEY);

    return lastSeen !== currentVersion;
  } catch {
    return true;
  }
};

/*
 * Saves the current version so release notes aren't shown again.
 */
export const markReleaseNotesSeen = async (version: string): Promise<void> => {
  await AsyncStorage.setItem(LAST_SEEN_VERSION_KEY, version);
};
