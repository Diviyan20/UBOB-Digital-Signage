import { api } from "@/components/api/client";
import { MediaController } from "@/components/media_components/MediaController";
import { OutletDisplayComponent } from "@/components/media_components/OutletImageComponent";
import { OrderPreparation } from "@/components/OrderPreparation";
import { NetworkStatusContext } from "@/context/NetworkStatusContext";
import { MediaScreenStyle as styles } from "@/styling/MediaStyles";
import { useFocusEffect } from "@react-navigation/native";
import { useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Text, View } from "react-native";

interface OutletInfo {
  order_api_url: string;
  order_api_key: string;
}

const MediaScreen = () => {
  const { outlet_id } = useLocalSearchParams();
  const [outletInfo, setOutletInfo] = useState<OutletInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const appState = useRef(AppState.currentState);
  const [isOnline, setIsOnline] = useState(true);

  // Refresh when app comes to foreground from background
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

  // Refresh when screen gains focus
  useFocusEffect(
    useCallback(() => {
      setRefreshKey((prev) => prev + 1);
    }, []),
  );

  // Only start heartbeat if device is validated and can access media
  useEffect(() => {
    const sendHeartbeat = async () => {
      try {
        console.log("[HEARTBEAT] Sending heartbeat.....");

        const response = await fetch(api.heartbeat, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            outlet_id: outlet_id,
            outlet_status: "online",
            timestamp: new Date().toISOString(),
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Heartbeat Failed");
        }
        setIsOnline(true);
        console.log("[HEARTBEAT] Success");
      } catch (err) {
        setIsOnline(false);
        console.warn("[HEARTBEAT] Failed:", err);
      }
    };

    const interval = setInterval(sendHeartbeat, 120000); // Send heartbeat every 2 minutes
    sendHeartbeat();
    return () => clearInterval(interval);
  }, [outletInfo, outlet_id]);

  useEffect(() => {
    const fetchOutletInfo = async () => {
      try {
        const response = await fetch(api.outletInfo(outlet_id as string));
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to fetch outlet info");
        }

        setOutletInfo(data.outlet);
      } catch (err: any) {
        setError(err.message);
      }
    };
    if (outlet_id) {
      fetchOutletInfo();
    }
  }, [outlet_id]);

  const getOrderTrackingUrl = (): string | undefined => {
    if (!outletInfo?.order_api_url || !outletInfo?.order_api_key) {
      return undefined;
    }
    return `${outletInfo.order_api_url}?access_token=${outletInfo.order_api_key}`;
  };

  if (error) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.errorText}>Error: {error}</Text>
      </View>
    );
  }

  // Device is validated and has credentials - show media screen
  return (
    <NetworkStatusContext.Provider value={{ isOnline, setIsOnline }}>
      <View style={styles.container}>
        <View style={styles.topRow}>
          <View style={styles.leftColumn}>
            <MediaController key={refreshKey} />
          </View>

          <View style={styles.rightColumn}>
            <OrderPreparation orderTrackingUrl={getOrderTrackingUrl()} />
          </View>
        </View>

        <View style={[styles.bottomRow, { marginBottom: 36 }]}>
          <OutletDisplayComponent />
        </View>

        {/* Badge floats over everything — no layout impact */}
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
export default MediaScreen;
