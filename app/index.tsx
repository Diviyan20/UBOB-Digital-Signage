import { OutletLoginForm } from "@/components/login_forms/OutletLoginForm";
import { checkOfflineCredentials, offlineLogin } from "@/services/LoginService";
import { router } from "expo-router";
import * as Updates from "expo-updates";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

export default function Index() {
  const [phase, setPhase] = useState<"checking_update" | "booting" | "login">(
    "checking_update",
  );

  useEffect(() => {
    const startup = async () => {
      // Step 1: Check and apply update silently
      if (!__DEV__) {
        try {
          const result = await Updates.checkForUpdateAsync();
          if (result.isAvailable) {
            await Updates.fetchUpdateAsync();
            await Updates.reloadAsync(); // app restarts here, nothing below runs
          }
        } catch (err) {
          console.warn("[UPDATE] Check failed:", err);
        }
      }

      // Step 2: Try offline login
      setPhase("booting");

      const hasCredentials = await checkOfflineCredentials();
      if (hasCredentials) {
        const result = await offlineLogin();
        if (result.success && result.route) {
          router.replace({
            pathname: result.route as any,
            params: result.params,
          });
          return;
        }
      }

      // Step 3: Show login form
      setPhase("login");
    };

    startup();
  }, []);

  if (phase === "checking_update") {
    return (
      <View style={styles.splash}>
        <ActivityIndicator size="large" color="#888" />
        <Text style={styles.splashText}>Checking for updates...</Text>
      </View>
    );
  }

  if (phase === "booting") {
    return (
      <View style={styles.splash}>
        <ActivityIndicator size="large" color="#888" />
      </View>
    );
  }

  return <OutletLoginForm />;
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
  },

  splashText: {
    fontSize: 14,
    color: "#888",
  },
});
