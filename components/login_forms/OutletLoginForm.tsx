import { OutletLoginStyles as styles } from "@/styling/OutletLoginStyles";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
import { Alert, Image, Pressable, Text, View } from "react-native";
import { api } from "../api/client";
import { ImagePreloader } from "../media_components/ImagePreloader";
import { OutletDropdownComponent } from "../OutletDropdownComponent";
import { ErrorOverlayComponent } from "../overlays/ErrorOverlayComponent";
import { LoggingInOverlayComponent } from "../overlays/LogginInOverlayComponent";
import SavedOutletOverlay from "../overlays/SavedOutletOverlay";

type ScreenType = "signage" | "media";

interface ToggleButtonProps {
  label: string;
  active: boolean;
  disabled?: boolean;
  focused?: boolean;
  onPress?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
}

const MEDIA_SCREEN_ENABLED = false; // Enables / Disables Media Screen

const ToggleButton: React.FC<ToggleButtonProps> = ({
  label,
  active,
  disabled = false,
  focused = false,
  onPress,
  onFocus,
  onBlur,
}) => {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      onFocus={onFocus}
      onBlur={onBlur}
      style={[
        styles.toggleButton,

        // Active state
        active && styles.toggleButtonActive,

        // Disabled state
        disabled && styles.disabledButton,

        // Focus state (TV Remote / Keyboard)
        focused && styles.focusedButton,
      ]}
    >
      <Text
        style={[
          styles.toggleText,
          active && styles.toggleTextActive,
          disabled && styles.disabledText,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
};

export const OutletLoginForm: React.FC = () => {
  const [outlet_id, setOutletId] = useState<string>("");
  const [screenType, setScreenType] = useState<ScreenType>("signage");
  const [batchNumber, setBatchNumber] = useState<number>(1);
  const [focusedButton, setFocusedButton] = useState<string | null>(null);
  const [inputFocused, setInputFocused] = useState(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorVisible, setErrorVisible] = useState(false);
  const [status, setStatus] = useState<
    | "loading"
    | "fetching_promotions"
    | "preloading_images"
    | "success"
    | "error"
    | undefined
  >();
  const [imagesToPreload, setImagesToPreload] = useState<any[]>([]);
  const [preloadingProgress, setPreloadingProgress] = useState<{
    loaded: number;
    total: number;
  }>({ loaded: 0, total: 0 });

  const loginIdRef = useRef<string>("");

  // Regular login - Only validate outlet and show media screen
  const handleLogin = async (id?: string) => {
    const loginId = id ?? outlet_id; // use passed id, fall back to state
    if (loading) return;
    if (!loginId.trim()) return;
    loginIdRef.current = loginId;
    // Check if outlet exists
    try {
      setLoading(true);
      setStatus("loading");
      const response = await fetch(api.validateOutlet, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outlet_id: loginId }),
      });

      const data = await response.json();
      if (response.ok && data.is_valid) {
        // Store all data in one call
        await AsyncStorage.multiSet([
          ["saved_outlet", JSON.stringify({ id: loginId, name: data.outlet_name })],
          ["outlet_id", loginId],
          ["region", data.outlet_location ?? ""],
          ["screen_type", screenType],
          ["batch_number", batchNumber.toString()],
        ]);

        // Branch based on Screen Type
        if (screenType === "media") {
          setStatus("success");
          setTimeout(() => {
            router.replace({
              pathname: "/screens/VideoScreen",
              params: { outlet_id: loginIdRef.current },
            });
          }, 1000);
          return;
        }

        // Signage screen - existing preload flow
        setStatus("fetching_promotions");
        try {
          const imagesResponse = await fetch(api.outletImages, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ outlet_id: loginId }),
          });
          const imagesData = await imagesResponse.json();
          const outletImages = imagesData.media || [];

          if (outletImages.length === 0) {
            setStatus("error");
            setTimeout(() => {
              router.replace({
                pathname: "/screens/MediaScreen",
                params: { outlet_id: loginIdRef.current },
              });
            }, 1500);
            return;
          }
          setImagesToPreload(outletImages);
          setStatus("preloading_images");
          setPreloadingProgress({ loaded: 0, total: outletImages.length });
        } catch (error) {
          setStatus("success");
          setTimeout(() => {
            router.replace({
              pathname: "/screens/MediaScreen",
              params: { outlet_id: loginIdRef.current },
            });
          }, 1500);
        }
      } else {
        // Invalid outlet
        setStatus("error");
        setErrorVisible(true);
      }
    } catch (err) {
      setLoading(false);
      Alert.alert(
        "Connection Error",
        "Could not connect to server. Please check:\n" +
        "1. Flask server is running\n" +
        "2. Using correct URL (10.0.2.2:5000 for emulator / https://wp6gcj3019.execute-api.ap-southeast-5.amazonaws.com for APK.)\n" +
        "3. Network connection is active",
      );
    }
  };
  // Handle all preloaded Images
  const handleImagesPreloaded = useCallback(() => {
    setStatus("success");
    setTimeout(() => {
      router.replace({
        pathname: "/screens/MediaScreen",
        params: { outlet_id: loginIdRef.current },
      });
    }, 1500);
  }, []);

  const handlePreloadingProgress = useCallback(
    (loaded: number, total: number) => {
      setPreloadingProgress({ loaded, total });
    },
    [],
  );

  const handlePreloadingError = useCallback((error: string) => {
    console.warn("Image preloading error:", error);
  }, []);

  // Helper function to get overlay message based on status
  const getOverlayMessage = () => {
    switch (status) {
      case "loading":
        return "Logging in...";
      case "fetching_promotions":
        return "Fetching Promotions...";
      case "preloading_images":
        const { loaded, total } = preloadingProgress;
        return `Loading Images... (${loaded}/${total})`;
      case "success":
        return "Success! Loading Media...";
      case "error":
        return "Some / All Images may not have loaded in. Consider restarting the app.";
      default:
        return "Loading...";
    }
  };

  return (
    <View style={styles.container}>
      <Image
        style={styles.imageContainer}
        source={require("../images/Logo.png")}
      />
      <View style={styles.card}>
        <Text style={styles.label}>Outlet ID</Text>

        <View
          style={[
            { width: "100%", marginBottom: 16 },
            inputFocused && styles.focusedInputContainer
          ]}
        >
          <OutletDropdownComponent
            onSelect={(id) => setOutletId(id)}
            prefillId={outlet_id}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
          />
        </View>

        {/* Screen Type Selection */}
        <Text style={styles.label}>Screen Type</Text>

        <View style={styles.toggleRow}>

          {/* Signage Screen */}
          <ToggleButton
            label="Signage Screen"
            active={screenType === "signage"}
            focused={focusedButton === "signage"}
            onFocus={() => setFocusedButton("signage")}
            onBlur={() => setFocusedButton(null)}
            onPress={() => setScreenType("signage")}
          />

          {/* Disabled Media Player */}
          <ToggleButton
            label="Media Player"
            active={screenType === "media"}
            disabled={true}
            focused={focusedButton === "media"}
            onFocus={() => setFocusedButton("media")}
            onBlur={() => setFocusedButton(null)}
          />

        </View>

        {/* Batch Buttons — only visible when Media Player is selected */}
        {screenType === "media" && (
          <View style={styles.toggleRow}>
            {[1, 2, 3].map((num) => (
              <ToggleButton
                key={num}
                label={`Batch ${num}`}
                active={batchNumber === num}
                focused={focusedButton === `batch-${num}`}
                onFocus={() => setFocusedButton(`batch-${num}`)}
                onBlur={() => setFocusedButton(null)}
                onPress={() => setBatchNumber(num)}
              />
            ))}
          </View>
        )}

        <Pressable style={[
          styles.loginButton,
          focusedButton === "login" && styles.focusedButton,
        ]}
          onFocus={() => setFocusedButton("login")}
          onBlur={() => setFocusedButton(null)}
          onPress={() => handleLogin()}>
          <Text style={styles.loginButtonText}>Log In</Text>
        </Pressable>
      </View>

      {errorVisible && (
        <ErrorOverlayComponent
          visible={errorVisible}
          errorType="invalid_outlet"
          onRetry={() => setErrorVisible(false)}
        />
      )}

      <LoggingInOverlayComponent
        visible={loading}
        status={status || "loading"}
        message={getOverlayMessage()}
      />

      {/* Hidden preloader component */}
      {imagesToPreload.length > 0 && status === "preloading_images" && (
        <ImagePreloader
          images={imagesToPreload}
          onAllImagesLoaded={handleImagesPreloaded}
          onProgress={handlePreloadingProgress}
          onError={handlePreloadingError}
        />
      )}

      <SavedOutletOverlay onUseSaved={(id) => {
        setOutletId(id);
        handleLogin(id);
      }} />
    </View>
  );
};