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
  getMediaRetryState,
  registerMediaRetryFailure,
} from "@/services/MediaService";

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

  // ───────────────────────────────────────────────────────────────────────────
  // Form state
  // ───────────────────────────────────────────────────────────────────────────

  const [outlet_id, setOutletId] = useState("");
  const [screenType, setScreenType] = useState<ScreenType>("signage");
  const [orientation, setOrientation] = useState<OrientationType>("Landscape");
  const [batchNumber, setBatchNumber] = useState(1);
  const [tier, setTier] = useState<TierType>("Tier A");

  const [focusedButton, setFocusedButton] = useState<string | null>(null);

  const [inputFocused, setInputFocused] = useState(false);

  // ───────────────────────────────────────────────────────────────────────────
  // Login state
  // ───────────────────────────────────────────────────────────────────────────

  const [loading, setLoading] = useState(false);

  const [errorVisible, setErrorVisible] = useState(false);

  const [status, setStatus] = useState<
    | "loading"
    | "downloading_media"
    | "preloading_images"
    | "success"
    | undefined
  >(undefined);

  // ───────────────────────────────────────────────────────────────────────────
  // Download progress
  // ───────────────────────────────────────────────────────────────────────────

  const [downloadProgress, setDownloadProgress] = useState({
    loaded: 0,
    total: 0,
    currentFile: "",
  });

  const [imagesToPreload, setImagesToPreload] = useState<any[]>([]);

  // ───────────────────────────────────────────────────────────────────────────
  // Retry state
  // ───────────────────────────────────────────────────────────────────────────

  const [retryCount, setRetryCount] = useState(0);

  const [retryBlockedUntil, setRetryBlockedUntil] = useState(0);

  const [remainingSeconds, setRemainingSeconds] = useState(0);

  const loginIdRef = useRef("");

  // ───────────────────────────────────────────────────────────────────────────
  // Initial setup
  // ───────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    ScreenOrientation.unlockAsync();
  }, []);

  // ───────────────────────────────────────────────────────────────────────────
  // Load saved session
  // ───────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const hydrateSavedSession = async () => {
      const session = await loadOutletSession();

      if (!session) {
        return;
      }

      if (session.outletId) {
        setOutletId(session.outletId);
      }

      setScreenType(session.screenType);

      setBatchNumber(session.batchNumber);

      setTier(session.tier);

      setOrientation(session.orientation);
    };

    hydrateSavedSession();
  }, []);

  // ───────────────────────────────────────────────────────────────────────────
  // Load retry state
  // ───────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const loadRetryState = async () => {
      const state = await getMediaRetryState();

      setRetryCount(state.retryCount);

      setRetryBlockedUntil(state.blockedUntil);
    };

    loadRetryState();
  }, []);

  // ───────────────────────────────────────────────────────────────────────────
  // Cooldown countdown
  // ───────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!retryBlockedUntil) {
      setRemainingSeconds(0);
      return;
    }

    const updateCountdown = () => {
      const remainingMs = retryBlockedUntil - Date.now();

      if (remainingMs <= 0) {
        setRemainingSeconds(0);
        setRetryBlockedUntil(0);
        setRetryCount(0);
        return;
      }

      setRemainingSeconds(Math.ceil(remainingMs / 1000));
    };

    updateCountdown();

    const timer = setInterval(updateCountdown, 1000);

    return () => clearInterval(timer);
  }, [retryBlockedUntil]);

  const isRetryBlocked = remainingSeconds > 0;

  // Format remaining cooldown:
  // 299 seconds → 04:59
  // 65 seconds  → 01:05
  // 5 seconds   → 00:05
  const formatCooldown = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);

    const remaining = seconds % 60;

    return `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(
      2,
      "0",
    )}`;
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Login button text
  // ───────────────────────────────────────────────────────────────────────────

  const loginButtonText = isRetryBlocked
    ? `Retry in ${formatCooldown(remainingSeconds)}`
    : "Log In";

  // ───────────────────────────────────────────────────────────────────────────
  // Outlet ID selection
  // ───────────────────────────────────────────────────────────────────────────

  const handleOutletIdSelected = async (id: string) => {
    setOutletId(id);

    try {
      const outlet = await validateOutlet(id);

      if (outlet.tier) {
        setTier(outlet.tier);
      }
    } catch {
      setTier("Tier A");
    }
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Reset login UI
  // ───────────────────────────────────────────────────────────────────────────

  const resetLoginUI = () => {
    setLoading(false);

    setStatus(undefined);

    setDownloadProgress({
      loaded: 0,
      total: 0,
      currentFile: "",
    });
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Handle network failure
  // ───────────────────────────────────────────────────────────────────────────

  const handleNetworkFailure = async () => {
    const retry = await registerMediaRetryFailure();

    setRetryCount(retry.retryCount);

    setRetryBlockedUntil(retry.blockedUntil);

    if (retry.blocked) {
      Alert.alert(
        "Network Connectivity Error",
        "Network connectivity error. No tries left.",
      );

      return;
    }

    const triesLeft = Math.max(0, 5 - retry.retryCount);

    Alert.alert(
      "Network Connectivity Error",
      `Network connectivity error. ${triesLeft} ${
        triesLeft === 1 ? "try" : "tries"
      } left.`,
    );
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Login
  // ───────────────────────────────────────────────────────────────────────────

  const handleLogin = async (id?: string) => {
    if (loading) {
      return;
    }

    if (retryBlockedUntil > Date.now()) {
      return;
    }

    const loginId = id ?? outlet_id;

    if (!loginId.trim()) {
      return;
    }

    loginIdRef.current = loginId;

    try {
      setLoading(true);
      setStatus("loading");

      const response = await loginOutlet(
        {
          outletId: loginId,
          screenType,
          batchNumber,
          tier,
          orientation,
        },
        (progress) => {
          setStatus("downloading_media");

          setDownloadProgress({
            loaded: progress.completed,
            total: progress.total,
            currentFile: progress.currentFile,
          });
        },
      );

      if (response.tier) {
        setTier(response.tier);
      }

      // ─────────────────────────────────────────────────────────────────────
      // Failed login
      // ─────────────────────────────────────────────────────────────────────

      if (!response.success) {
        resetLoginUI();

        // Invalid outlet is NOT a retryable
        // network problem.
        if (response.errorType === "invalid_outlet") {
          setErrorVisible(true);

          return;
        }

        // Network failure.
        if (response.errorType === "network") {
          await handleNetworkFailure();
          return;
        }

        Alert.alert("Error", response.error || "Login failed.");

        return;
      }

      // ─────────────────────────────────────────────────────────────────────
      // Media Player
      // ─────────────────────────────────────────────────────────────────────

      if (response.route === "/screens/PlaylistScreen") {
        resetLoginUI();

        router.replace({
          pathname: response.route as any,
          params: {
            outlet_id: loginIdRef.current,
            batch_number: batchNumber.toString(),
            tier,
            orientation,
          },
        });

        return;
      }

      // ─────────────────────────────────────────────────────────────────────
      // Signage image preloading
      // ─────────────────────────────────────────────────────────────────────

      if (response.preloadImages?.length) {
        setStatus("preloading_images");

        setImagesToPreload(response.preloadImages);

        return;
      }

      // ─────────────────────────────────────────────────────────────────────
      // Generic route fallback
      // ─────────────────────────────────────────────────────────────────────

      if (response.route) {
        setTimeout(() => {
          resetLoginUI();

          router.replace({
            pathname: response.route as any,
            params: {
              outlet_id: loginIdRef.current,
            },
          });
        }, 1000);
      }
    } catch (error) {
      console.error("[LOGIN FORM] Login error:", error);

      resetLoginUI();

      await handleNetworkFailure();
    }
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Signage images completed
  // ───────────────────────────────────────────────────────────────────────────

  const handleImagesPreloaded = useCallback(() => {
    setStatus("success");

    setTimeout(() => {
      resetLoginUI();

      router.replace({
        pathname: "/screens/MediaScreen",
        params: {
          outlet_id: loginIdRef.current,
        },
      });
    }, 1000);
  }, []);

  const handlePreloadingError = useCallback((error: string) => {
    console.warn("Image preloading error:", error);
  }, []);

  // ───────────────────────────────────────────────────────────────────────────
  // Overlay message
  // ───────────────────────────────────────────────────────────────────────────

  const getOverlayMessage = () => {
    switch (status) {
      case "loading":
        return "Logging in...";

      case "downloading_media":
        return "Preparing Media...";

      case "success":
        return "Success! Loading Media...";

      case "preloading_images":
        return "Loading Images...";

      default:
        return "Loading...";
    }
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Render
  // ───────────────────────────────────────────────────────────────────────────

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
            {
              width: "100%",
              marginBottom: 8,
            },
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

        {screenType === "media" && (
          <>
            <Text style={styles.label}>Batch Number</Text>

            <SelectDropdown
              options={[
                {
                  label: "Batch 1",
                  value: 1,
                },
                {
                  label: "Batch 2",
                  value: 2,
                },
                {
                  label: "Batch 3",
                  value: 3,
                },
              ]}
              selectedValue={batchNumber}
              onSelect={(value) => setBatchNumber(value)}
              focused={focusedButton === "batch"}
              onFocus={() => setFocusedButton("batch")}
              onBlur={() => setFocusedButton(null)}
            />

            <Text style={styles.label}>Tier</Text>

            <View style={styles.readOnlyField}>
              <Text style={styles.readOnlyText}>{tier}</Text>
            </View>

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

        {/* ────────────────────────────────────────────────────────────────── */}
        {/* Download progress */}
        {/* ────────────────────────────────────────────────────────────────── */}

        {status === "downloading_media" && downloadProgress.total > 0 && (
          <View
            style={{
              width: "100%",
              marginTop: 16,
              marginBottom: 12,
            }}
          >
            <Text
              style={{
                color: "#FFFFFF",
                fontSize: 16,
                marginBottom: 8,
              }}
            >
              Downloading media...
            </Text>

            <Text
              style={{
                color: "#CCCCCC",
                fontSize: 14,
                marginBottom: 8,
              }}
            >
              {downloadProgress.loaded} / {downloadProgress.total}
            </Text>

            <View
              style={{
                width: "100%",
                height: 10,
                backgroundColor: "#333333",
                borderRadius: 5,
                overflow: "hidden",
              }}
            >
              <View
                style={{
                  width: `${
                    (downloadProgress.loaded / downloadProgress.total) * 100
                  }%`,
                  height: "100%",
                  backgroundColor: "#4CAF50",
                }}
              />
            </View>

            {downloadProgress.currentFile ? (
              <Text
                numberOfLines={1}
                style={{
                  color: "#AAAAAA",
                  fontSize: 12,
                  marginTop: 8,
                }}
              >
                {downloadProgress.currentFile}
              </Text>
            ) : null}
          </View>
        )}

        {/* ────────────────────────────────────────────────────────────────── */}
        {/* Login / Retry button */}
        {/* ────────────────────────────────────────────────────────────────── */}

        <Pressable
          disabled={loading || isRetryBlocked}
          style={[
            styles.loginButton,
            isPortrait && styles.loginButtonPortrait,
            focusedButton === "login" && styles.focusedButton,
            (loading || isRetryBlocked) && styles.disabledButton,
          ]}
          onFocus={() => setFocusedButton("login")}
          onBlur={() => setFocusedButton(null)}
          onPress={() => {
            void handleLogin();
          }}
        >
          <Text style={styles.loginButtonText}>{loginButtonText}</Text>
        </Pressable>
      </View>

      {/* Invalid outlet error */}
      {errorVisible && (
        <ErrorOverlayComponent
          visible={errorVisible}
          errorType="invalid_outlet"
          onRetry={() => setErrorVisible(false)}
        />
      )}

      {/* Login/loading overlay */}
      <LoggingInOverlayComponent
        visible={loading && status !== "downloading_media"}
        message={getOverlayMessage()}
      />

      {/* Signage image preloader */}
      {imagesToPreload.length > 0 && status === "preloading_images" && (
        <ImagePreloader
          images={imagesToPreload}
          onAllImagesLoaded={handleImagesPreloaded}
          onError={handlePreloadingError}
        />
      )}
    </View>
  );
};
