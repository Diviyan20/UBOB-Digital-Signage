import ImageComponent from "@/components/ImageComponent";
import OrderPreparation from "@/components/OrderPreparation";
import OutletDisplayComponent from "@/components/OutletImageComponent";
import { useLocalSearchParams } from "expo-router";
import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";

const SERVER_URL = "https://ubob-digital-signage.onrender.com";

const MediaScreen = () => {
  const { outletId } = useLocalSearchParams();

  useEffect(() => {
    const sendHeartbeat = async () => {
      try {
        const response = await fetch(`${SERVER_URL}/heartbeat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            device_id: outletId,
            status: "online",
            timestamp: new Date().toISOString(),
          })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Heartbeat Failed!");
      } catch (err) {
        console.warn("Heartbeat Error: ", err);
      }
    };

    const interval = setInterval(sendHeartbeat, 10000); // Send heartbeat every 10 seconds (for testing)
    sendHeartbeat();

    return () => clearInterval(interval);
  }, []);


  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <View style={styles.leftColumn}>
          <ImageComponent />
        </View>
        <View style={styles.rightColumn}>
          <OrderPreparation />
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
    backgroundColor: '#F2F0EF',
    padding: 10,
  },
  topRow: {
    flex: 3,
    flexDirection: 'row',
    gap: 10,
  },
  leftColumn: {
    flex: 1,
    borderRadius: 20,
    overflow: 'hidden',
  },
  rightColumn: {
    flex: 2,
    borderRadius: 10,
    overflow: 'hidden',
  },
  bottomRow: {
    flex: 1,
    marginTop: 10,
    borderRadius: 20,
    overflow: 'hidden',
  },
});

export default MediaScreen;