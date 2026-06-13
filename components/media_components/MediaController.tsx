import { useNetworkStatus } from "@/context/NetworkStatusContext";
import React, { useEffect, useRef, useState } from "react";

import { config } from "../api/client";

import { watchDogOverlayStyle as styles } from "@/styling/OverlayStyles";
import { Text, View } from "react-native";

import { ImageComponent } from "./ImageComponent";
import { VideoComponent } from "./VideoComponent";

type MediaState =
  | "IMAGES"
  | "VIDEOS";

const WATCHDOG_TIMEOUT_MS = 12000; // if no playback after 12s, revert
const MAX_RETRIES = 3;             // after 3 failed attempts, show error
const ERROR_DISPLAY_DURATION = 8000 // show error for 8 seconds

export const MediaController = () => {

  const [mediaState, setMediaState] = useState<MediaState>("IMAGES"); // Controls current screen mode
  const {isOnline, setIsOnline}= useNetworkStatus();

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

  const clearWatchdog = () =>{
    if (watchdogRef.current){
      clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
  };

  /*
    * Fetch interval config from backend
    * Also check whether system is online to send requests to backend
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

        setIsOnline(true); // Backend reachable
        console.log("[NETWORK] Backend reachable");
      }
      catch (error) {
        console.error("CONFIG ERROR: ", error);

        // Backend unreachable
      setIsOnline(false);
      console.warn("[NETWORK] Backend unreachable");
      }
    };
    fetchConfig();

    // Recheck every 30 seconds
    const interval = setInterval(fetchConfig, 30000);
    return () => clearInterval(interval);
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

  /*
    * Switch from images -> videos
 */
  useEffect(() => {
    if (mediaState !== "IMAGES") return;
    if (showError) return; // Error state - stay on images, no more transitions
    if (!isOnline) return;

    console.log(`[MEDIA] State=${mediaState} Online=${isOnline}`);

    const timer = setTimeout(() => {
      setMediaState("VIDEOS");
    }, stateInterval);

    return () => clearTimeout(timer);
  }, [mediaState, stateInterval, showError, isOnline]);

  // Show error display for 8 seconds
  useEffect(() =>{
    if (!showError) return;

    const timer = setTimeout(() =>{
      console.log("[WATCHDOG] Error dismissed - resuming image display");
      setShowError(false);
      setRetryCount(0); // Reset retries to 0 so videos can be attempted again later
    }, ERROR_DISPLAY_DURATION);

    return () => clearTimeout(timer);
  }, [showError]);

  // Watchdog — fires when state switches to VIDEOS
  useEffect(() => {
    if (mediaState !== "VIDEOS") return;

    console.log(`[WATCHDOG] Started — waiting ${WATCHDOG_TIMEOUT_MS / 1000}s for playback`);

    watchdogRef.current = setTimeout(() => {
        const nextRetry = retryCount + 1;
        console.warn(`[WATCHDOG] No playback detected. Retry ${nextRetry}/${MAX_RETRIES}`);

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
}