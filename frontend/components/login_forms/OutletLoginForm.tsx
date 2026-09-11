import { OutletLoginStyles as styles } from "@/styling/OutletLoginStyles";
import { router } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Image, Pressable, Text, View } from "react-native";

import { OutletDropdownComponent } from "../dropdowns/OutletDropdownComponent";
import { SelectDropdown } from "../dropdowns/SelectDropdownComponent";
import { ImagePreloader } from "../media_components/ImagePreloader";
import { ErrorOverlayComponent } from "../overlays/ErrorOverlayComponent";
import { LoggingInOverlayComponent } from "../overlays/LogginInOverlayComponent";
import { LoginToggleButton } from "./LoginToggleButton";

import {
  loadOutletSession,
  loginOutlet,
  TierType,
  validateOutlet,
} from "@/frontend/services/LoginService";

import { useLoginRetry } from "@/frontend/hooks/useLoginRetry";

import * as ScreenOrientation from "expo-screen-orientation";
import { useWindowDimensions } from "react-native";

import Logo from "../images/Logo.png";

// ===============
// TYPES
// ===============
type ScreenType = "signage" | "media";
type OrientationType = "Landscape" | "Portrait";

type LoginStatus =
  | "loading"
  | "downloading_media"
  | "preloading_images"
  | "success"
  | undefined;

export const OutletLoginForm: React.FC = () => {
  const { width, height } = useWindowDimensions();

  const isPortrait = height > width;

  // ================
  // FORM STATE
  // ================

  const [outletId, setOutletId] = useState("");
  const [screenType, setScreenType] = useState<ScreenType>("signage");
  const [orientation, setOrientation] = useState<OrientationType>("Landscape");

  const [batchNumber, setBatchNumber] = useState(1);
  const [tier, setTier] = useState<TierType>("Tier A");

  // ===========
  // UI STATE
  // ===========
  const [focusedButton, setFocusedButton] = useState<string | null>(null);
  const [inputFocused, setInputFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorVisible, setErrorVisible] = useState(false);
  const [status, setStatus] = useState<LoginStatus>(undefined);
  const [imagesToPreload, setImagesToPreload] = useState<any[]>([]);

  // ===================
  // DOWNLOAD PROGRESS
  // ===================

  const [downloadProgress, setDownloadProgress] = useState({
    loaded: 0,
    total: 0,
    currentFile: "",
  });

  // ==================
  // RETRY / COOLDOWN
  // ==================
  const {
    isBlocked: isRetryBlocked,
    buttonText: loginButtonText,
    registerFailure,
  } = useLoginRetry();

  /*
  ================
  LOGIN ID REF
  ================
  * Used because navigation and callbacks can happen after React state
  *has changed.
  */
  const loginIdRef = useRef("");

  // ===============
  // INITIAL SETUP
  // ===============
  useEffect(() => {
    ScreenOrientation.unlockAsync();
  }, []);

  /*
    ==========================
    RESTORE PREVIOUS SESSION
    ==========================
    * We hydrate the form from AsyncStorage so the user doesn't need to
    * configure the TV from scratch every time the app starts.
  */

  useEffect(() => {
    const hydrateSavedSession = async () => {
      try {
        const session = await loadOutletSession();

        if (!session) return;

        if (session.outletId) setOutletId(session.outletId);

        setScreenType(session.screenType);
        setBatchNumber(session.batchNumber);
        setTier(session.tier);
        setOrientation(session.orientation);
      } catch (error) {
        console.warn("[LOGIN] Failed to restore previous session:", error);
      }
    };

    void hydrateSavedSession();
  }, []);

  /*
    ===================
    OUTLET SELECTION
    ===================
    * Selecting an outlet performs a lightweight validation so the Tier field
    * can immediately reflect the outlet's configured tier.
  
  */
  const handleOutletIdSelected = useCallback(async (id: string) => {
    setOutletId(id);

    try {
      const outlet = await validateOutlet(id);

      if (outlet.tier) setTier(outlet.tier);
    } catch (error) {
      console.warn(
        "[LOGIN] Could not resolve outlet tier. Defaulting to Tier A.",
        error,
      );
      setTier("Tier A");
    }
  }, []);

  /*
    ==========================
    RESET TEMPORARY LOGIN UI
    ==========================
    * This does NOT touch the retry system
    * It only clears temporary UI state after a successful or failed login
  */

  const resetLoginUI = useCallback(() => {
    setLoading(false);
    setStatus(undefined);

    setDownloadProgress({
      loaded: 0,
      total: 0,
      currentFile: "",
    });
  }, []);

  /*
    ========================
    HANDLE NETWORK FAILURE
    ========================
    * Retry state is persisted inside MediaService
    * This function only:
       1. registers the failure
       2. updates the retry hook
       3. shows the correct alert
  */

  const handleNetworkFailure = useCallback(async () => {
    const retry = await registerFailure();

    if (retry.blocked) {
      Alert.alert(
        "Network Connectivity Error",
        "Network connectivity error. No tries left.",
      );

      return;
    }

    Alert.alert(
      "Network Connectivity Error",
      `Network connectivity error. ${retry.triesLeft} ${
        retry.triesLeft === 1 ? "try" : "tries"
      } left.`,
    );
  }, [registerFailure]);

  /*
    ==============
    LOGIN
    ==============
    * This is intentionally the only major business workflow left in this component.
    * The services handle the actual backend/media work.
    * This function only coordinates the flow and navigation.
  */

  const handleLogin = useCallback(
    async (id?: string) => {
      if (loading || isRetryBlocked) {
        return;
      }

      const loginId = id ?? outletId;

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

        // Backend may resolve the authoritative tier.
        if (response.tier) {
          setTier(response.tier);
        }

        // =================
        // LOGIN FAILED
        // =================

        if (!response.success) {
          resetLoginUI();

          // Invalid outlet is a user/configuration problem.
          // It does not consume a retry attempt.
          if (response.errorType === "invalid_outlet") {
            setErrorVisible(true);
            return;
          }

          // Network failure consumes a retry attempt.
          if (response.errorType === "network") {
            await handleNetworkFailure();
            return;
          }

          // Anything else is a generic application error.
          Alert.alert("Error", response.error || "Login failed.");

          return;
        }

        /*
          =================
          MEDIA PLAYER
          =================
          * At this point MediaService has prepared the first playable media
          * item and the PlaylistScreen can take over playback.
        */
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

        /*
          ============
          SIGNAGE
          ============
          * The signage flow has a separate image-preload step.
        */
        if (response.preloadImages?.length) {
          setStatus("preloading_images");
          setImagesToPreload(response.preloadImages);
          return;
        }

        // =========================
        // GENERIC ROUTE FALLBACK
        // =========================

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
    },
    [
      loading,
      isRetryBlocked,
      outletId,
      screenType,
      batchNumber,
      tier,
      orientation,
      resetLoginUI,
      handleNetworkFailure,
    ],
  );

  // ===============================
  // SIGNAGE IMAGE PRELOAD COMPLETED
  // ===============================
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
  }, [resetLoginUI]);

  const handlePreloadingError = useCallback((error: string) => {
    console.warn("Image preloading error:", error);
  }, []);

  // ===================
  // OVERLAY MESSAGE
  // ===================
  const getOverlayMessage = (): string => {
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

  // ==============
  // RENDER
  // ==============

  return (
    <View style={[styles.container, isPortrait && styles.containerPortrait]}>
      {/* ===================================================================== */}
      {/* LOGO */}
      {/* ===================================================================== */}

      <Image
        style={[
          styles.imageContainer,
          isPortrait && styles.imageContainerPortrait,
        ]}
        source={Logo}
      />

      <View style={[styles.card, isPortrait && styles.cardPortrait]}>
        {/* =================================================================== */}
        {/* OUTLET */}
        {/* =================================================================== */}

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
            prefillId={outletId}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
          />
        </View>

        {/* 
          ===============
          SCREEN TYPE 
          ===============
        */}

        <Text style={styles.label}>Screen Type</Text>

        <View style={styles.toggleRow}>
          <LoginToggleButton
            label="Signage Screen"
            active={screenType === "signage"}
            focused={focusedButton === "signage"}
            onFocus={() => setFocusedButton("signage")}
            onBlur={() => setFocusedButton(null)}
            onPress={() => setScreenType("signage")}
          />

          <LoginToggleButton
            label="Media Player"
            active={screenType === "media"}
            focused={focusedButton === "media"}
            onFocus={() => setFocusedButton("media")}
            onBlur={() => setFocusedButton(null)}
            onPress={() => setScreenType("media")}
          />
        </View>

        {/* =================================================================== */}
        {/* MEDIA PLAYER OPTIONS */}
        {/* =================================================================== */}

        {screenType === "media" && (
          <>
            {/* BATCH */}

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

            {/* TIER */}

            <Text style={styles.label}>Tier</Text>

            <View style={styles.readOnlyField}>
              <Text style={styles.readOnlyText}>{tier}</Text>
            </View>

            {/* ORIENTATION */}

            <Text style={styles.label}>Orientation</Text>

            <View style={styles.toggleRow}>
              {(["Landscape", "Portrait"] as OrientationType[]).map((value) => (
                <LoginToggleButton
                  key={value}
                  label={value}
                  active={orientation === value}
                  focused={focusedButton === value}
                  onFocus={() => setFocusedButton(value)}
                  onBlur={() => setFocusedButton(null)}
                  onPress={() => setOrientation(value)}
                />
              ))}
            </View>
          </>
        )}

        {/* =================================================================== */}
        {/* DOWNLOAD PROGRESS */}
        {/* =================================================================== */}

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

        {/* =================================================================== */}
        {/* LOGIN BUTTON */}
        {/* =================================================================== */}

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

      {/* ===================================================================== */}
      {/* INVALID OUTLET ERROR */}
      {/* ===================================================================== */}

      {errorVisible && (
        <ErrorOverlayComponent
          visible={errorVisible}
          errorType="invalid_outlet"
          onRetry={() => setErrorVisible(false)}
        />
      )}

      {/* ===================================================================== */}
      {/* LOGIN LOADING OVERLAY */}
      {/* ===================================================================== */}

      <LoggingInOverlayComponent
        visible={loading && status !== "downloading_media"}
        message={getOverlayMessage()}
      />

      {/* ===================================================================== */}
      {/* SIGNAGE IMAGE PRELOADER */}
      {/* ===================================================================== */}

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
