import { OutletLoginStyles as styles } from "@/styling/OutletLoginStyles";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { Alert, Image, Modal, Pressable, Text, View } from "react-native";
import { api } from "../api/client";
import ImagePreloader from "../media_components/ImagePreloader";
import OutletDropdownComponent from "../OutletDropdownComponent";
import ErrorOverlayComponent from "../overlays/ErrorOverlayComponent";
import LoggingInOverlayComponent from "../overlays/LogginInOverlayComponent";

const OutletLoginForm: React.FC = () => {
  const [outlet_id, setOutletId] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [errorVisible, setErrorVisible] = useState(false);
  const [focusedButton, setFocusedButton] = useState<"yes" | "no" | null>(null);
  const [status, setStatus] = useState<
    | "loading"
    | "fetching_promotions"
    | "preloading_images"
    | "success"
    | "error"
    | undefined
  >();
  const [outletData, setOutletData] = useState<any>(null);
  const [imagesToPreload, setImagesToPreload] = useState<any[]>([]);
  const [preloadingProgress, setPreloadingProgress] = useState<{
    loaded: number;
    total: number;
  }>({ loaded: 0, total: 0 });

  const [savedOutlet, setSavedOutlet] = useState<{ id: string; name: string } | null>(null);
  const [showSavedPrompt, setShowSavedPrompt] = useState(false);

  const handleUseSaved = () => {
    setShowSavedPrompt(false);
    setOutletId(savedOutlet!.id);
  };
  
  const handleIgnoreSaved = () => {
    setShowSavedPrompt(false);
    setSavedOutlet(null);
  };

  // Regular login - Only validate outlet and show media screen
  const handleLogin = async () => {
    if (loading) return;
    if (!outlet_id.trim()) return;

    try {
      setLoading(true);
      setStatus("loading");

      // Check if outlet exists
      const response = await fetch(api.validateOutlet, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outlet_id: outlet_id }),
      });

      const data = await response.json();

      if (response.ok && data.is_valid) {
        // Store outlet data for later use
        setOutletData(data);

        await AsyncStorage.setItem(
          "saved_outlet",
          JSON.stringify({ id: outlet_id, name: data.outlet_name })
        );

        // Fetch outlet images for preloading
        setStatus("fetching_promotions");

        try {
          const imagesResponse = await fetch(api.outletImages, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
          });

          const imagesData = await imagesResponse.json();
          const outletImages = imagesData.media || [];

          if (outletImages.length === 0) {
            setStatus("error");
            setTimeout(() => {
              router.replace({
                pathname: "/screens/MediaScreen",
                params: { outlet_id },
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
              params: { outlet_id },
            });
          }, 1500);
        }
      } else {
        // Invalid outlet
        setStatus("error");
        setErrorVisible(true);
      }
    } catch (err) {
      Alert.alert(
        "Connection Error",
        "Could not connect to server. Please check:\n" +
          "1. Flask server is running\n" +
          "2. Using correct URL (10.0.2.2:5000 for emulator /  https://wp6gcj3019.execute-api.ap-southeast-5.amazonaws.com for APK.)\n" +
          "3. Network connection is active",
      );
    }
  };

  useEffect(() => {
    const loadSavedOutlet = async () => {
      try {
        const saved = await AsyncStorage.getItem("saved_outlet");
        if (saved) {
          const parsed = JSON.parse(saved);
          setSavedOutlet(parsed);
          setShowSavedPrompt(true);
        }
      } catch (err) {
        console.warn("Failed to load saved outlet:", err);
      }
    };
    loadSavedOutlet();
  }, []);

  // Handle all preloaded Images
  const handleImagesPreloaded = useCallback(() => {
    setStatus("success");
    setTimeout(() => {
      router.replace({
        pathname: "/screens/MediaScreen",
        params: { outlet_id },
      });
    }, 1500);
  }, [outlet_id]);

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
        <OutletDropdownComponent 
            onSelect={(id) => setOutletId(id)}
            prefillId={outlet_id}/>

        <Pressable style={styles.loginButton} onPress={handleLogin}>
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
      {showSavedPrompt && savedOutlet && (
  <Modal transparent animationType="fade" visible={showSavedPrompt}>
    <View style={styles.overlay}>
      <View style={styles.popupCard}>
        <Text style={styles.title}>Welcome Back!</Text>
        <Text style={styles.message}>
          Continue with saved outlet?
        </Text>
        <Text style={styles.outletInfo}>
          {savedOutlet.id} — {savedOutlet.name}
        </Text>
        <View style={styles.buttonRow}>
          <Pressable
            style={[
              styles.button,
              styles.yesButton,
              focusedButton === "yes" && styles.yesButtonFocused,
            ]}
            onPress={handleUseSaved}
            onFocus={() => setFocusedButton("yes")}
            onBlur={() => setFocusedButton(null)}
            onHoverIn={() => setFocusedButton("yes")}
            onHoverOut={() => setFocusedButton(null)}
          >
            <Text style={styles.yesText}>Yes</Text>
          </Pressable>
          <Pressable
            style={[
              styles.button,
              styles.noButton,
              focusedButton === "no" && styles.noButtonFocused,
            ]}
            onPress={handleIgnoreSaved}
            onFocus={() => setFocusedButton("no")}
            onBlur={() => setFocusedButton(null)}
            onHoverIn={() => setFocusedButton("no")}
            onHoverOut={() => setFocusedButton(null)}
          >
            <Text style={styles.noText}>No</Text>
          </Pressable>
        </View>
      </View>
    </View>
  </Modal>
)}
    </View>
  );
};

export default OutletLoginForm;
