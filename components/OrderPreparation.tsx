import { useNetworkStatus } from "@/context/NetworkStatusContext";
import Constants from "expo-constants";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";

interface OrderPreparationProps {
  orderTrackingUrl?: string;
}

export const OrderPreparation: React.FC<OrderPreparationProps> = ({
  orderTrackingUrl,
}) => {
  const { isOnline } = useNetworkStatus();
  // Use dynamic URL, otherwise fallback to hardcoded version
  const EXPO_PUBLIC_ORDER_TRACKING_BASE_URL =
    orderTrackingUrl ||
    Constants.expoConfig?.extra?.EXPO_PUBLIC_ORDER_TRACKING_BASE_URL;

  if (!EXPO_PUBLIC_ORDER_TRACKING_BASE_URL) return null;

  return (
    <>
      <View style={styles.container}>
        <WebView
          source={{ uri: EXPO_PUBLIC_ORDER_TRACKING_BASE_URL }}
          style={styles.webview}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          mixedContentMode="always"
          originWhitelist={["*"]}
          allowsInlineMediaPlayback
          startInLoadingState
        />
        {/* Subtle offline overlay — covers the WebView error without alarming anyone */}
        {!isOnline && (
          <View style={styles.offlineOverlay}>
            <View style={styles.offlinePill}>
              <Text style={styles.offlineText}>Offline</Text>
            </View>
          </View>
        )}
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "#fff",
  },

  webview: {
    flex: 1,
  },

  offlineOverlay: {
    ...StyleSheet.absoluteFillObject, // covers the entire WebView
    backgroundColor: "rgba(245, 245, 245, 0.92)",
    justifyContent: "center",
    alignItems: "center",
  },

  offlinePill: {
    backgroundColor: "#fff",
    borderRadius: 16,
    paddingHorizontal: 24,
    paddingVertical: 18,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
    gap: 6,
  },

  offlineText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#555",
  },

  offlineSub: {
    fontSize: 12,
    color: "#999",
  },
});
