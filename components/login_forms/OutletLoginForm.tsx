import { OutletLoginStyles as styles } from "@/styling/OutletLoginStyles";
import { router } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Image, Pressable, Text, View } from "react-native";
import { OutletDropdownComponent } from "../dropdowns/OutletDropdownComponent";
import { SelectDropdown } from "../dropdowns/SelectDropdownComponent";
import { ImagePreloader } from "../media_components/ImagePreloader";
import { ErrorOverlayComponent } from "../overlays/ErrorOverlayComponent";
import { LoggingInOverlayComponent } from "../overlays/LogginInOverlayComponent";

import {
  loadOutletSession,
  loginOutlet,
  TierType,
  validateOutlet,
} from "@/services/LoginService";

import * as ScreenOrientation from "expo-screen-orientation";
import { useWindowDimensions } from "react-native";

type ScreenType = "signage" | "media";
type OrientationType = "Landscape" | "Portrait";

interface ToggleButtonProps {
  label: string;
  active: boolean;
  disabled?: boolean;
  focused?: boolean;
  onPress?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
}

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
        active && styles.toggleButtonActive,
        disabled && styles.disabledButton,
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
  const { width, height } = useWindowDimensions();
  const isPortrait = height > width;

  const [outlet_id, setOutletId] = useState<string>("");
  const [screenType, setScreenType] = useState<ScreenType>("signage");
  const [orientation, setOrientation] = useState<OrientationType>("Landscape");
  const [batchNumber, setBatchNumber] = useState<number>(1);
  const [tier, setTier] = useState<TierType>("Tier A");
  const [focusedButton, setFocusedButton] = useState<string | null>(null);
  const [inputFocused, setInputFocused] = useState(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorVisible, setErrorVisible] = useState(false);
  const [status, setStatus] = useState<
    | "loading"
    | "fetching_promotions"
    | "preloading_images"
    | "success"
    | undefined
  >();
  const [imagesToPreload, setImagesToPreload] = useState<any[]>([]);
  const [preloadingProgress, setPreloadingProgress] = useState<{
    loaded: number;
    total: number;
  }>({ loaded: 0, total: 0 });

  const loginIdRef = useRef<string>("");

  // ─── On mount: unlock orientation, hydrate session ─────────

  useEffect(() => {
    ScreenOrientation.unlockAsync();
  }, []);

  // Hydrate saved session fields from AsyncStorage — no prompt, just fills inputs
  useEffect(() => {
    const hydrateSavedSession = async () => {
      const session = await loadOutletSession();
      if (!session) return;

      if (session.outletId) setOutletId(session.outletId);
      setScreenType(session.screenType);
      setBatchNumber(session.batchNumber);
      setTier(session.tier);
      setOrientation(session.orientation);
    };
    hydrateSavedSession();
  }, []);

  // Outlet ID Selection
  const handleOutletIdSelected = async (id: string) => {
    setOutletId(id);
    try {
      const outlet = await validateOutlet(id);

      if (outlet.tier) setTier(outlet.tier);
    } catch {
      console.warn("No Tier set, defaulting to Tier A");
      setTier("Tier A");
    }
  };

  // Login
  const handleLogin = async (id?: string) => {
    const loginId = id ?? outlet_id;

    if (loading) return;
    if (!loginId.trim()) return;

    loginIdRef.current = loginId;

    try {
      setLoading(true);
      setStatus("loading");

      const response = await loginOutlet({
        outletId: loginId,
        screenType,
        batchNumber,
        tier,
        orientation,
      });

      if (response.tier) {
        setTier(response.tier);
      }

      if (!response.success) {
        setErrorVisible(true);
        setLoading(false);
        return;
      }

      /*
        MEDIA PLAYER FLOW
      */
      if (response.route === "/screens/PlaylistScreen") {
        setStatus("success");

        setTimeout(() => {
          setLoading(false);

          router.replace({
            pathname: response.route as any,
            params: {
              outlet_id: loginIdRef.current,
              batch_number: batchNumber.toString(),
              tier,
              orientation,
            },
          });
        }, 1000);

        return;
      }

      /*
        SIGNAGE FLOW - Preload images
      */
      if (response.preloadImages?.length) {
        setStatus("preloading_images");
        setImagesToPreload(response.preloadImages);
        setPreloadingProgress({
          loaded: 0,
          total: response.preloadImages.length,
        });

        return;
      }

      // No promotions fallback
      if (response.route) {
        setTimeout(() => {
          setLoading(false);

          router.replace({
            pathname: response.route as any,
            params: {
              outlet_id: loginIdRef.current,
            },
          });
        }, 1500);
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

  const handleImagesPreloaded = useCallback(() => {
    setStatus("success");

    setTimeout(() => {
      setLoading(false);

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
      default:
        return "Loading...";
    }
  };

  return (
    <View style={[styles.container, isPortrait && styles.containerPortrait]}>
      <Image
        style={[
          styles.imageContainer,
          isPortrait && styles.imageContainerPortrait,
        ]}
        source={require("../images/Logo.png")}
      />
      <View style={[styles.card, isPortrait && styles.cardPortrait]}>
        <Text style={styles.label}>Outlet ID</Text>

        <View
          style={[
            { width: "100%", marginBottom: 8 },
            inputFocused && styles.focusedInputContainer,
          ]}
        >
          <OutletDropdownComponent
            onSelect={handleOutletIdSelected}
            prefillId={outlet_id}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
          />
        </View>

        {/* Screen Type Selection */}
        <Text style={styles.label}>Screen Type</Text>
        <View style={styles.toggleRow}>
          <ToggleButton
            label="Signage Screen"
            active={screenType === "signage"}
            focused={focusedButton === "signage"}
            onFocus={() => setFocusedButton("signage")}
            onBlur={() => setFocusedButton(null)}
            onPress={() => setScreenType("signage")}
          />
          <ToggleButton
            label="Media Player"
            active={screenType === "media"}
            focused={focusedButton === "media"}
            onFocus={() => setFocusedButton("media")}
            onBlur={() => setFocusedButton(null)}
            onPress={() => setScreenType("media")}
          />
        </View>

        {/* Media Player options — only visible when Media Player is selected */}
        {screenType === "media" && (
          <>
            {/* Batch Number */}
            <Text style={styles.label}>Batch Number</Text>
            <SelectDropdown
              options={[
                { label: "Batch 1", value: 1 },
                { label: "Batch 2", value: 2 },
                { label: "Batch 3", value: 3 },
              ]}
              selectedValue={batchNumber}
              onSelect={(value) => setBatchNumber(value)}
              focused={focusedButton === "batch"}
              onFocus={() => setFocusedButton("batch")}
              onBlur={() => setFocusedButton(null)}
            />

            {/* Tier */}
            <Text style={styles.label}>Tier</Text>
            <View style={styles.readOnlyField}>
              <Text style={styles.readOnlyText}>{tier}</Text>
            </View>

            {/* Orientation */}
            <Text style={styles.label}>Orientation</Text>
            <View style={styles.toggleRow}>
              {(["Landscape", "Portrait"] as OrientationType[]).map((o) => (
                <ToggleButton
                  key={o}
                  label={o}
                  active={orientation === o}
                  focused={focusedButton === o}
                  onFocus={() => setFocusedButton(o)}
                  onBlur={() => setFocusedButton(null)}
                  onPress={() => setOrientation(o)}
                />
              ))}
            </View>
          </>
        )}

        <Pressable
          style={[
            styles.loginButton,
            isPortrait && styles.loginButtonPortrait,
            focusedButton === "login" && styles.focusedButton,
          ]}
          onFocus={() => setFocusedButton("login")}
          onBlur={() => setFocusedButton(null)}
          onPress={() => handleLogin()}
        >
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

      {imagesToPreload.length > 0 && status === "preloading_images" && (
        <ImagePreloader
          images={imagesToPreload}
          onAllImagesLoaded={handleImagesPreloaded}
          onProgress={handlePreloadingProgress}
          onError={handlePreloadingError}
        />
      )}
    </View>
  );
};
