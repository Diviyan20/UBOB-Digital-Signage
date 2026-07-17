import { OutletLoginForm } from "@/components/login_forms/OutletLoginForm";
import { checkOfflineCredentials, offlineLogin } from "@/services/LoginService";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";

export default function Index() {
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const tryOfflineLogin = async () => {
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
      setChecking(false);
    };

    tryOfflineLogin();
  }, []);

  if (checking) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color="#888" />
      </View>
    );
  }

  return <OutletLoginForm />;
}
