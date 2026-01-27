import ImageComponent from "@/components/image_components/ImageComponent";
import OutletDisplayComponent from "@/components/image_components/OutletImageComponent";
import SystemLoginForm from "@/components/login_forms/SystemLoginForm";
import OrderPreparation from "@/components/OrderPreparation";
import { useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

const SERVER_URL = "https://ubob-digital-signage.onrender.com";

interface DeviceValidationResult {
  can_access_media: boolean;
  reason?: string;
  outlet_info?: any;
  device_info?: any;
}

const MediaScreen = () => {
  const { outletId } = useLocalSearchParams();
  const [deviceValidation, setDeviceValidation] = useState<DeviceValidationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const validateDevice = async () => {
      try {
        const response = await fetch(`${SERVER_URL}/validate_device`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ device_id: outletId })
        });

        const data = await response.json();
        
        if (!response.ok) {
          throw new Error(data.error || "Validation failed");
        }

        setDeviceValidation(data);
      } catch (err) {
        console.error("Device validation error:", err);
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };

    validateDevice();
  }, [outletId]);

  useEffect(() => {
    // Only start heartbeat if device is validated and can access media
    if (deviceValidation?.can_access_media) {
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

      const interval = setInterval(sendHeartbeat, 10000); // Send heartbeat every 10 seconds
      sendHeartbeat();

      return () => clearInterval(interval);
    }
  }, [deviceValidation, outletId]);

  const getOrderTrackingUrl = (): string | undefined =>{
    if(deviceValidation?.device_info){
      const {order_api_url, order_api_key} = deviceValidation.device_info;
      if (order_api_url && order_api_key){
        // Construct the full URL: base_url + pos-order-tracking + access_token
        console.log("URL: ", `${order_api_url}?access_token=${order_api_key}`);
        return `${order_api_url}?access_token=${order_api_key}`
      }
    }
    return undefined; // Fall back to hardcoded URL in OrderPreparation component
  }

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Validating device...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.errorText}>Error: {error}</Text>
      </View>
    );
  }

  // If device doesn't have credentials, show admin login
  if (!deviceValidation?.can_access_media && deviceValidation?.reason === "missing_credentials") {
    return (
      <SystemLoginForm />
    );
  }

  // If device validation failed for other reasons
  if (!deviceValidation?.can_access_media) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.errorText}>
          Device validation failed: {deviceValidation?.reason}
        </Text>
      </View>
    );
  }

  // Device is validated and has credentials - show media screen
  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <View style={styles.leftColumn}>
          <ImageComponent />
        </View>
        <View style={styles.rightColumn}>
          <OrderPreparation orderTrackingUrl={getOrderTrackingUrl()}/>
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
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  errorText: {
    fontSize: 16,
    color: '#ff4444',
    textAlign: 'center',
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