import { api } from "@/components/api/client";
import MediaController from "@/components/media_components/MediaController";
import OutletDisplayComponent from "@/components/media_components/OutletImageComponent";
import OrderPreparation from "@/components/OrderPreparation";
import { useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

interface OutletInfo {
  order_api_url: string;
  order_api_key: string;
}

const MediaScreen = () => {
  const { outlet_id } = useLocalSearchParams();
  const [outletInfo, setOutletInfo] = useState<OutletInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Only start heartbeat if device is validated and can access media
    const sendHeartbeat = async () => {
      try {
        console.log("Sending Heartbeat.");
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
        if (!response.ok) throw new Error(data.error || "Heartbeat Failed!");
      } catch (err) {
        console.warn("Heartbeat Error: ", err);
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
        setOutletInfo(data);
      } catch (err: any) {
        setError(err.messsage);
      }
    };
    if (outlet_id) {
      fetchOutletInfo();
    }
  }, [outlet_id]);

  const getOrderTrackingUrl = (): string | undefined => {
    if (!outletInfo?.order_api_url && !outletInfo?.order_api_key) {
      return undefined;
    } else {
      return `${outletInfo.order_api_url}?access_token=${outletInfo.order_api_key}`;
    }
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
    <View style={styles.container}>
      <View style={styles.topRow}>
        <View style={styles.leftColumn}>
          <MediaController />
        </View>
        <View style={styles.rightColumn}>
          <OrderPreparation orderTrackingUrl={getOrderTrackingUrl()} />
        </View>
      </View>
      <View style={styles.bottomRow}>
        <OutletDisplayComponent />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F2F0EF",
    padding: 10,
  },
  centered: {
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: "#666",
  },
  errorText: {
    fontSize: 16,
    color: "#ff4444",
    textAlign: "center",
  },
  topRow: {
    flex: 3,
    flexDirection: "row",
    gap: 10,
  },
  leftColumn: {
    flex: 1,
    borderRadius: 20,
    overflow: "hidden",
  },
  rightColumn: {
    flex: 2,
    borderRadius: 10,
    overflow: "hidden",
  },
  bottomRow: {
    flex: 1,
    marginTop: 10,
    borderRadius: 20,
    overflow: "hidden",
  },
});

export default MediaScreen;
