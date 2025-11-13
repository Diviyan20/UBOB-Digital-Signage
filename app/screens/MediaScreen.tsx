import ImageComponent from "@/components/ImageComponent";
import OutletDisplayComponent from "@/components/OutletImageComponent";
import { useLocalSearchParams } from "expo-router";
import React, { useEffect } from "react";
import { Dimensions, StyleSheet, View } from "react-native";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const SERVER_URL = "http://10.0.2.2:5000";

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
      {/* Top section - Promo card */}
      <View style={styles.promoSection}>
        <ImageComponent />
      </View>
      <OutletDisplayComponent />
    </View>

  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  promoSection: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default MediaScreen;