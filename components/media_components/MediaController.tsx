import { useNetworkStatus } from "@/context/NetworkStatusContext";
import React, { useEffect, useRef, useState } from "react";

import { config } from "../api/client";

import { getSignageVersion } from "@/services/MediaService";
import { watchDogOverlayStyle as styles } from "@/styling/OverlayStyles";
import { Text, View } from "react-native";
import { ImageComponent } from "./ImageComponent";
import { VideoComponent } from "./VideoComponent";

type MediaState = "IMAGES" | "VIDEOS";

const WATCHDOG_TIMEOUT_MS = 12000; // if no playback after 12s, revert
const MAX_RETRIES = 3; // after 3 failed attempts, show error
const ERROR_DISPLAY_DURATION = 8000; // show error for 8 seconds

export const MediaController = () => {
  const [mediaState, setMediaState] = useState<MediaState>("IMAGES"); // Controls current screen mode
  const [hasSignageVideos, setHasSignageVideos] = useState(true);
  const { isOnline, setIsOnline } = useNetworkStatus();
  const lastStatusRef = useRef<boolean | null>(null);

  /*
   * How long images show before videos start
   */
  const [stateInterval, setStateInterval] = useState(60000); // Used as a fallback if config fails

  /*
   * Parameters for watchdog timer
   */
  const [retryCount, setRetryCount] = useState(0);
  const [showError, setShowError] = useState(false);
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearWatchdog = () => {
    if (watchdogRef.current) {
      clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
  };

  /*
   * Fetch interval config from backend
   */
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const response = await fetch(config);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        setStateInterval(data.config.state_interval);
      } catch (error) {
        console.error("CONFIG ERROR: ", error);
      }
    };
    fetchConfig();
  }, []);

  // Backend unreachable - Lock state to IMAGES
  useEffect(() => {
    if (!isOnline) {
      console.warn("[NETWORK] Offline - locking controller to IMAGES");

      clearWatchdog();
      setRetryCount(0);
      setShowError(false);

      if (mediaState !== "IMAGES") {
        setMediaState("IMAGES");
      }
    }
  }, [isOnline]);

  const checkSignageVideos = async () => {
    try {
      console.log("[SIGNAGE CHECK] Checking folder status...");

      const version = await getSignageVersion();
      const hasVideos = version.itemCount > 0;

      if (lastStatusRef.current !== hasVideos) {
        console.log(
          `[SIGNAGE STATUS CHANGED] ${hasVideos ? "VIDEOS FOUND" : "NO VIDEOS"}`,
        );

        lastStatusRef.current = hasVideos;
      }
      console.log(`TOTAL VIDEOS: ${version.itemCount}`);
      setHasSignageVideos(hasVideos);
    } catch (err) {
      console.error("[SIGNAGE CHECK] Failed:", err);
      setHasSignageVideos(false);
    }
  };

  useEffect(() => {
    checkSignageVideos();

    const interval = setInterval(() => {
      checkSignageVideos();
    }, 120000);

    return () => clearInterval(interval);
  }, []);

  /*
   * Switch from images -> videos
   */
  useEffect(() => {
    console.log(
      `[MEDIA CHECK]
       State=${mediaState}
       Online=${isOnline}
       HasVideos=${hasSignageVideos}
       ShowError=${showError}`,
    );

    if (mediaState !== "IMAGES") {
      console.log("[MEDIA CHECK] Blocked - not in IMAGES state");
      return;
    }

    if (showError) {
      console.log("[MEDIA CHECK] Blocked - error overlay active");
      return;
    }

    if (!isOnline) {
      console.log("[MEDIA CHECK] Blocked - offline");
      return;
    }

    if (!hasSignageVideos) {
      console.log(
        "[MEDIA CHECK] Blocked - no videos in Digital Signage folder",
      );
      return;
    }

    console.log(
      `[MEDIA CHECK] Scheduling transition to VIDEOS in ${stateInterval}ms`,
    );

    const timer = setTimeout(() => {
      console.log("[MEDIA CHECK] Switching to VIDEOS");
      setMediaState("VIDEOS");
    }, stateInterval);

    return () => clearTimeout(timer);
  }, [mediaState, stateInterval, showError, isOnline, hasSignageVideos]);

  useEffect(() => {
    console.log(
      `[SIGNAGE STATUS] hasSignageVideos changed -> ${hasSignageVideos}`,
    );
  }, [hasSignageVideos]);

  // Show error display for 8 seconds
  useEffect(() => {
    if (!showError) return;

    const timer = setTimeout(() => {
      console.log("[WATCHDOG] Error dismissed - resuming image display");
      setShowError(false);
      setRetryCount(0); // Reset retries to 0 so videos can be attempted again later
    }, ERROR_DISPLAY_DURATION);

    return () => clearTimeout(timer);
  }, [showError]);

  // Watchdog — fires when state switches to VIDEOS
  useEffect(() => {
    if (mediaState !== "VIDEOS") return;

    console.log(
      `[WATCHDOG] Started — waiting ${WATCHDOG_TIMEOUT_MS / 1000}s for playback`,
    );

    watchdogRef.current = setTimeout(() => {
      const nextRetry = retryCount + 1;
      console.warn(
        `[WATCHDOG] No playback detected. Retry ${nextRetry}/${MAX_RETRIES}`,
      );

      if (nextRetry >= MAX_RETRIES) {
        console.error("[WATCHDOG] Max retries reached — showing error");
        setShowError(true);
      } else {
        setRetryCount(nextRetry);
      }
      setMediaState("IMAGES"); // always revert to images
    }, WATCHDOG_TIMEOUT_MS);

    return () => clearWatchdog();
  }, [mediaState]);

  // Called by VideoComponent when first frame actually starts playing
  const handlePlaybackStarted = () => {
    console.log("[WATCHDOG] Playback confirmed — watchdog cancelled");
    clearWatchdog();
    setRetryCount(0); // reset retries on success
  };

  // Called after all videos finish
  const handleVideosFinished = () => {
    setMediaState("IMAGES");
  };

  return (
    <>
      {mediaState === "IMAGES" && <ImageComponent />}

      {mediaState === "VIDEOS" && (
        <VideoComponent
          onAllVideosFinished={handleVideosFinished}
          onPlaybackStarted={handlePlaybackStarted}
        />
      )}

      {/* Error overlay — shown after max retries, stays until app restart */}
      {showError && (
        <View style={styles.errorOverlay}>
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>Video Playback Unavailable</Text>
            <Text style={styles.errorMessage}>
              Videos could not be loaded after several attempts.{"\n"}
              Please restart the app in a few minutes.
            </Text>
            <Text style={styles.errorSub}>
              Promotion images will continue to display.
            </Text>
          </View>
        </View>
      )}
    </>
  );
};
