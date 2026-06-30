import { initializeConsoleInterceptor } from "@/debugging/ConsoleInterceptor";
import { Stack } from "expo-router";
import * as Updates from "expo-updates";
import { useEffect } from "react";

initializeConsoleInterceptor();
export default function RootLayout() {
  useEffect(() => {
    async function updateApp() {
      try {
        const update = await Updates.checkForUpdateAsync();

        if (update.isAvailable) {
          await Updates.fetchUpdateAsync();
          await Updates.reloadAsync();
        }
      } catch (e) {
        console.log("OTA Update Error:", e);
      }
    }

    updateApp();
  }, []);

  return <Stack screenOptions={{ headerShown: false }}></Stack>;
}
