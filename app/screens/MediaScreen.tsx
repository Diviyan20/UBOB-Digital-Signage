import { api } from "@/components/api/client";
import { MediaController } from "@/components/media_components/MediaController";
import { OutletDisplayComponent } from "@/components/media_components/OutletImageComponent";
import { NetworkStatusContext } from "@/context/NetworkStatusContext";
import { SchedulerProvider, useScheduler } from "@/context/SchedulerContext";
import { DeviceDebugOverlay } from "@/debugging/DeviceDebugOverlay";
import { LogOverlay } from "@/debugging/LogOverlay";
import { NetworkDebugOverlay } from "@/debugging/NetworkDebugOverlay";
import { MediaScreenStyle as styles } from "@/styling/MediaStyles";
import { useFocusEffect } from "@react-navigation/native";
import { useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Text, View } from "react-native";

interface OutletInfo {
  order_api_url: string;
  order_api_key: string;
}

// Inner component — lives inside SchedulerProvider, can safely call useScheduler()
const MediaScreenInner: React.FC<{ outlet_id: string }> = ({ outlet_id }) => {
  const { isOnline } = useScheduler();
  const [outletInfo, setOutletInfo] = useState<OutletInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [mediaState, setMediaState] = useState<"IMAGES" | "VIDEOS">("IMAGES");
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextState === "active"
      ) {
        setRefreshKey((prev) => prev + 1);
      }
      appState.current = nextState;
    });
    return () => subscription.remove();
  }, []);

  useFocusEffect(
    useCallback(() => {
      setRefreshKey((prev) => prev + 1);
    }, []),
  );

  useEffect(() => {
    const fetchOutletInfo = async () => {
      try {
        const response = await fetch(api.outletInfo(outlet_id));
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || "Failed to fetch outlet info");
        setOutletInfo(data.outlet);
      } catch (err: any) {
        setError(err.message);
      }
    };
    if (outlet_id) fetchOutletInfo();
  }, [outlet_id]);

  const getOrderTrackingUrl = (): string | undefined => {
    if (!outletInfo?.order_api_url || !outletInfo?.order_api_key)
      return undefined;
    return `${outletInfo.order_api_url}?access_token=${outletInfo.order_api_key}`;
  };

  if (error) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.errorText}>Error: {error}</Text>
      </View>
    );
  }

  return (
    // setIsOnline is a no-op here — scheduler owns online state now
    <NetworkStatusContext.Provider value={{ isOnline, setIsOnline: () => {} }}>
      <View style={styles.container}>
        <View style={styles.topRow}>
          <View style={styles.leftColumn}>
            <MediaController key={refreshKey} onStateChange={setMediaState} />
          </View>
          <View style={styles.rightColumn}>
            <View style={styles.debugRow}>
              <DeviceDebugOverlay mediaState={mediaState} />
              <NetworkDebugOverlay />
            </View>

            <LogOverlay />
          </View>
        </View>

        <View style={[styles.bottomRow, { marginBottom: 36 }]}>
          <OutletDisplayComponent />
        </View>

        <View style={styles.badgeContainer}>
          <View
            style={[
              styles.dot,
              { backgroundColor: isOnline ? "#4CAF50" : "#FF9800" },
            ]}
          />
          <Text style={styles.badgeText}>
            {isOnline ? "Online" : "Offline"}
          </Text>
        </View>
      </View>
    </NetworkStatusContext.Provider>
  );
};

// Outer component — owns SchedulerProvider lifecycle
const MediaScreen = () => {
  const { outlet_id } = useLocalSearchParams();

  return (
    <SchedulerProvider>
      <MediaScreenInner outlet_id={outlet_id as string} />
    </SchedulerProvider>
  );
};

export default MediaScreen;
