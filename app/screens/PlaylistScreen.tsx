import { PlaylistComponent } from "@/components/media_components/PlaylistComponent";
import { DeviceDebugOverlay } from "@/debugging/DeviceDebugOverlay";
import { LogOverlay } from "@/debugging/LogOverlay";
import { NetworkDebugOverlay } from "@/debugging/NetworkDebugOverlay";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ScreenOrientation from "expo-screen-orientation";
import { useEffect } from "react";
import { View } from "react-native";

export default function PlaylistScreen() {
  useEffect(() => {
    const applyOrientation = async () => {
      const saved = await AsyncStorage.getItem("orientation");

      if (saved === "Portrait") {
        await ScreenOrientation.lockAsync(
          ScreenOrientation.OrientationLock.PORTRAIT,
        );
      } else {
        await ScreenOrientation.lockAsync(
          ScreenOrientation.OrientationLock.LANDSCAPE,
        );
      }
    };

    applyOrientation();

    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    };
  }, []);

  return (
    <View style={{ flex: 1 }}>
      <PlaylistComponent />

      <View style={{ position: "absolute", top: 10, left: 10, right: 10 }}>
        <DeviceDebugOverlay />
        <NetworkDebugOverlay />
        <LogOverlay />
      </View>
    </View>
  );
}
