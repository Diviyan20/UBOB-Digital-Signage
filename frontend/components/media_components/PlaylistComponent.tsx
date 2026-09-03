import {
  deletePlaylistFiles,
  getMediaDownloadState,
  loadAvailablePlaylist,
  PlaylistItems,
  refreshMediaPlayerPlaylist,
  registerMediaRetryFailure,
} from "@/frontend/services/MediaService";

import { getPlayableMedia } from "@/frontend/services/media/MediaSchedule";

import AsyncStorage from "@react-native-async-storage/async-storage";

import { router } from "expo-router";
import { useVideoPlayer } from "expo-video";

import React, { useEffect, useRef, useState } from "react";

import { VideoView } from "expo-video";
import { Alert, Animated, AppState, Easing, Text, View } from "react-native";

import { Image } from "expo-image";

import { api } from "../api/client";

import { PlaylistStyles as styles } from "@/styling/MediaStyles";

// =============================================================================
// Constants
// =============================================================================

type PlaybackMode = "loading" | "video" | "image" | "empty";

type OrientationType = "Landscape" | "Portrait";

const LOGIN_ROUTE = "/";

const DEFAULT_VERSION_CHECK_INTERVAL_MS = 5 * 60 * 60 * 1000;

const SCHEDULE_CHECK_INTERVAL_MS = 30 * 1000;

// =============================================================================
// Component
// =============================================================================

export const PlaylistComponent: React.FC = () => {
  // =============
  // UI STATE
  // =============
  const [playlist, setPlaylist] = useState<PlaylistItems[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [mode, setMode] = useState<PlaybackMode>("loading");

  const [orientation, setOrientation] = useState<OrientationType>("Landscape");

  // ========================
  // DISPLAY CONFIGURATION
  // ========================
  const [imageDisplayDuration, setImageDisplayDuration] = useState(5000);
  const [fadeDuration, setFadeDuration] = useState(400);
  const [versionCheckInterval, setVersionCheckInterval] = useState(
    DEFAULT_VERSION_CHECK_INTERVAL_MS,
  );

  // ---------------------------------------------------------------------------
  // Internal state
  //
  // Refs hold values that must survive renders without
  // causing additional renders.
  // ---------------------------------------------------------------------------

  const playlistRef = useRef<PlaylistItems[]>([]);

  const currentIndexRef = useRef(0);

  const allMediaRef = useRef<PlaylistItems[]>([]);

  const refreshRunningRef = useRef(false);

  const pendingDeleteRef = useRef<string[]>([]);

  const downloadErrorShownRef = useRef(false);

  // ================
  // ANIMATION
  // ================
  const fadeAnim = useRef(new Animated.Value(1)).current;

  // ================
  // VIDEO PLAYER
  // ================
  const player = useVideoPlayer(null, (p) => {
    p.loop = false;
  });

  const getPlaybackMode = (type: PlaylistItems["type"]): PlaybackMode => {
    return type === "video" ? "video" : "image";
  };

  // ===========================================================================
  // Helper: update playable playlist
  // ===========================================================================

  /**
   * Rebuilds the playable playlist from all downloaded media.
   *
   * The important rule:
   *
   * - Keep the current media when it is still playable.
   * - Otherwise start from the first playable item.
   * - If nothing is playable, enter "empty" mode.
   */

  const syncPlaylist = (allMedia: PlaylistItems[]): void => {
    allMediaRef.current = allMedia;

    const playable = getPlayableMedia(allMedia);

    const currentItem = playlistRef.current[currentIndexRef.current];

    // ==================
    // Nothing can play
    // ==================
    if (playable.length === 0) {
      playlistRef.current = [];
      setPlaylist([]);
      currentIndexRef.current = 0;
      setCurrentIndex(0);
      setMode("empty");
      return;
    }

    // =========================================
    // Keep currently playing media if possible
    // =========================================
    const currentIndex = currentItem
      ? playable.findIndex((item) => item.mediaUuid === currentItem.mediaUuid)
      : -1;

    if (currentIndex >= 0) {
      playlistRef.current = playable;
      setPlaylist(playable);
      currentIndexRef.current = currentIndex;
      setCurrentIndex(currentIndex);
      return;
    }

    // =====================================
    // Current media is no longer valid.
    // Start from the first playable media.
    // =====================================

    playlistRef.current = playable;
    setPlaylist(playable);
    currentIndexRef.current = 0;
    setCurrentIndex(0);
    setMode(playable[0].type);
  };

  // ================================
  // LOAD APPLICATION CONFIGURATION
  // ================================
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const response = await fetch(api.config);

        if (!response.ok) {
          throw new Error(`Config request failed: ${response.status}`);
        }

        const data = await response.json();

        const imageDuration = data.config?.image_display_duration;
        const fade = data.config?.fade_duration;
        const versionCheck = data.config?.version_check;

        if (typeof imageDuration === "number" && imageDuration > 0) {
          console.log(`[CONFIG] image_display_duration = ${imageDuration}ms`);
        }

        if (typeof fade === "number" && fade >= 0) {
          setFadeDuration(fade);
          console.log(`[CONFIG] fade_duration = ${fade}ms`);
        }

        if (typeof versionCheck == "number" && versionCheck > 0) {
          setVersionCheckInterval(versionCheck);
          console.log(`[CONFIG] version_check = ${versionCheck}ms`);
        }
      } catch (error) {
        console.warn("[CONFIG] Failed to load config. Using defaults.", error);
      }
    };

    void loadConfig();
  }, []);

  // ===================
  // LOAD ORIENTATION
  // ===================
  useEffect(() => {
    const loadOrientation = async () => {
      const value = await AsyncStorage.getItem("orientation");

      if (value === "Portrait" || value === "Landscape") {
        setOrientation(value);
      }
    };

    void loadOrientation();
  }, []);

  // =====================
  // INITIAL MEDIA LOAD
  // =====================
  useEffect(() => {
    const loadMedia = async () => {
      try {
        const media = await loadAvailablePlaylist();

        if (media.length === 0) {
          console.warn("[PLAYER] No locally available media");
          syncPlaylist([]);
          return;
        }

        console.log(`[PLAYER] Loaded ${media.length} local media item(s)`);

        syncPlaylist(media);
      } catch (error) {
        console.error("[PLAYER] Failed to load local media:", error);

        syncPlaylist([]);
      }
    };

    void loadMedia();
  }, []);

  // ============================
  // WATCH BACKGROUND DOWNLOADS
  // ============================
  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const state = await getMediaDownloadState();

        // ============================
        // Background download failed
        // ============================
        if (state.status === "error" && !downloadErrorShownRef.current) {
          downloadErrorShownRef.current = true;
          const retry = await registerMediaRetryFailure();

          if (retry.blocked) {
            Alert.alert(
              "Network Connectivity Error",
              "Network connectivity error. No tries left.",
            );
          } else {
            const triesLeft = Math.max(0, 5 - retry.retryCount);

            Alert.alert(
              "Network Connectivity Error",
              `Network connectivity error. ${triesLeft} ${
                triesLeft === 1 ? "try" : "tries"
              } left.`,
              [
                {
                  text: "Retry",
                  onPress: () => router.replace(LOGIN_ROUTE),
                },
              ],
            );
          }
          return;
        }
        // ==================================================
        // Check whether more downloaded media is available.
        // ==================================================
        const available = await loadAvailablePlaylist();

        if (available.length === 0) return;

        if (available.length !== allMediaRef.current.length) {
          console.log(
            `[PLAYER] Local media changed: ${available.length} item(s)`,
          );

          syncPlaylist(available);
        }
      } catch (error) {
        console.warn("[PLAYER] Failed to check background downloads:", error);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // =======================
  // RE-EVALUATE SCHEDULES
  // =======================
  useEffect(() => {
    const reevaluateSchedule = () => {
      if (allMediaRef.current.length === 0) return;

      console.log("[SCHEDULE] Re-evaluating schedule");

      syncPlaylist(allMediaRef.current);
    };

    const timer = setInterval(reevaluateSchedule, SCHEDULE_CHECK_INTERVAL_MS);

    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        reevaluateSchedule();
      }
    });

    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, []);

  // ====================================
  // REFRESH MEDIA PLAYER CONFIGURATION
  // ====================================
  const refreshPlaylist = async () => {
    if (refreshRunningRef.current) return;

    refreshRunningRef.current = true;

    try {
      console.log("[REFRESH] Checking Media Player configuration...");

      const result = await refreshMediaPlayerPlaylist();

      if (!result.changed) return;

      console.log(`[REFRESH] Received ${result.playlist.length} media item(s)`);

      pendingDeleteRef.current = result.oldFilesToDelete;

      const currentItem = playlistRef.current[currentIndexRef.current];

      syncPlaylist(result.playlist);

      await deletePlaylistFiles(
        pendingDeleteRef.current,
        currentItem?.localUri,
      );

      pendingDeleteRef.current = [];
    } catch (error) {
      console.warn(
        "[REFRESH] Failed to refresh Media Player configuration. Keeping current playback.",
        error,
      );
    } finally {
      refreshRunningRef.current = false;
    }
  };

  // ===============================
  // Periodic server version check
  // ===============================
  useEffect(() => {
    console.log(`[VERSION CHECK] Running every ${versionCheckInterval}ms`);

    const timer = setInterval(() => {
      void refreshPlaylist();
    }, versionCheckInterval);

    return () => clearInterval(timer);
  }, [versionCheckInterval]);

  // ===========================================================================
  // Configure video looping
  //
  // One active video:
  //     loop forever.
  //
  // Multiple active media:
  //     stop when the video ends so we can move
  //     to the next media item.
  // ===========================================================================
  useEffect(() => {
    player.loop = mode === "video" && playlist.length === 1;
  }, [mode, playlist.length, player]);

  // ===============
  // Play video
  // ===============
  useEffect(() => {
    if (mode !== "video") return;

    const item = playlistRef.current[currentIndexRef.current];

    if (!item?.localUri) return;

    const play = async () => {
      try {
        console.log(`[PLAYER] Playing ${item.fileName}`);
        console.log(`[PLAYER] Type: ${item.type}`);
        console.log(`[PLAYER] Frequency: ${item.frequency}`);

        await player.replaceAsync(item.localUri);

        player.play();
      } catch (error) {
        console.error(`[PLAYER] Failed to play ${item.fileName}:`, error);
      }
    };

    void play();
  }, [mode, currentIndex, player]);

  // =============================
  // Advance when video finishes
  // =============================
  useEffect(() => {
    const subscription = player.addListener("playToEnd", () => {
      const items = playlistRef.current;

      if (items.length <= 1) return;

      const nextIndex = (currentIndexRef.current + 1) % items.length;

      currentIndexRef.current = nextIndex;
      setCurrentIndex(nextIndex);
      setMode(items[nextIndex].type);
    });

    return () => subscription.remove();
  }, [player]);

  // =====================
  // Play Image
  // =====================
  useEffect(() => {
    if (mode !== "image") return;

    const item = playlistRef.current[currentIndexRef.current];

    if (!item) return;

    fadeAnim.setValue(1);

    const timer = setTimeout(() => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: fadeDuration,
        easing: Easing.linear,
        useNativeDriver: true,
      }).start(() => {
        const items = playlistRef.current;

        if (items.length === 0) {
          setMode("empty");
          return;
        }

        // One image stays on screen.
        if (items.length === 1) {
          fadeAnim.setValue(1);
          return;
        }

        const nextIndex = (currentIndexRef.current + 1) % items.length;

        currentIndexRef.current = nextIndex;

        setCurrentIndex(nextIndex);
        setMode(items[nextIndex].type);

        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: fadeDuration,
          easing: Easing.linear,
          useNativeDriver: true,
        }).start();
      });
    }, imageDisplayDuration);

    return () => clearTimeout(timer);
  }, [mode, currentIndex, imageDisplayDuration, fadeDuration, fadeAnim]);

  // ===========================================================================
  // Render current media
  // ===========================================================================

  const renderMedia = () => {
    if (mode === "loading") {
      return <Text style={styles.statusText}>Loading media...</Text>;
    }

    if (mode === "empty") {
      return <Text style={styles.statusText}>No media scheduled.</Text>;
    }

    const currentItem = playlist[currentIndex];

    if (!currentItem) {
      return null;
    }

    // -------------------------------------------------------------------------
    // Video
    // -------------------------------------------------------------------------

    if (mode === "video") {
      return (
        <VideoView
          player={player}
          style={styles.media}
          contentFit="contain"
          nativeControls={false}
        />
      );
    }

    // -------------------------------------------------------------------------
    // Image
    // -------------------------------------------------------------------------

    return (
      <Animated.View
        style={[
          styles.media,
          {
            opacity: fadeAnim,
          },
        ]}
      >
        <Image
          source={{
            uri: currentItem.localUri,
          }}
          style={styles.media}
          contentFit="contain"
          cachePolicy="memory"
        />
      </Animated.View>
    );
  };

  // ===========================================================================
  // Layout
  // ===========================================================================

  const cardStyle =
    orientation === "Portrait" ? styles.portraitCard : styles.landscapeCard;

  return (
    <View style={styles.screen}>
      <View style={cardStyle}>{renderMedia()}</View>
    </View>
  );
};
