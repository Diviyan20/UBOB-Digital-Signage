import * as Updates from "expo-updates";

export interface UpdateInfo {
  available: boolean;
}

/*
 * Checks expo-updates for a pending OTA update
 * Returns update info sourced from release_notes.json if one is available
 */
export const checkForUpdate = async (): Promise<UpdateInfo> => {
  try {
    // In Expo Go / dev mode, Updates.isEmbeddedLaunch is always true
    // and checkForUpdateAsync will throw — treat as no update
    if (__DEV__) {
      return {
        available: false,
      };
    }

    const result = await Updates.checkForUpdateAsync();

    return {
      available: result.isAvailable,
    };
  } catch (err) {
    console.warn("[UPDATE] Check failed: ", err);
    return {
      available: false,
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
