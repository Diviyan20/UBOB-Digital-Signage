import { Alert, Animated, Easing, Text, View } from "react-native";

import {
  deletePlaylistFiles,
  getMediaDownloadState,
  loadAvailablePlaylist,
  PlaylistItems,
  refreshPreparedPlaylist,
  registerMediaRetryFailure
} from "@/services/MediaService";

import { PlaylistStyles as styles } from "@/styling/MediaStyles";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import React, { useEffect, useRef, useState } from "react";
import { config } from "../api/client";

type PlaybackMode = "loading" | "video" | "image" | "empty";

type OrientationType = "Landscape" | "Portrait";

// Change this ONE constant if your login screen
// uses a different Expo Router path.
const LOGIN_ROUTE = "/";

const DEFAULT_VERSION_CHECK_INTERVAL_MS = 5 * 60 * 60 * 1000;

export const PlaylistComponent: React.FC = () => {
  const [playlist, setPlaylist] = useState<PlaylistItems[]>([]);

  const [mode, setMode] = useState<PlaybackMode>("loading");

  const [currentIndex, setCurrentIndex] = useState(0);

  const [displayDuration, setDisplayDuration] = useState(5000);

  const [fadeDuration, setFadeDuration] = useState(400);

  const [orientation, setOrientation] = useState<OrientationType>("Landscape");

  const [versionCheckInterval, setVersionCheckInterval] = useState(
    DEFAULT_VERSION_CHECK_INTERVAL_MS,
  );

  const fadeAnim = useRef(new Animated.Value(1)).current;

  const currentIndexRef = useRef(0);

  const playlistRef = useRef<PlaylistItems[]>([]);

  const pendingDeleteRef = useRef<string[]>([]);

  const refreshRunningRef = useRef(false);

  const downloadErrorShownRef = useRef(false);

  const player = useVideoPlayer(null, (p) => {
    p.loop = false;
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Load configuration
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const response = await fetch(config);

        const data = await response.json();

        if (!response.ok) {
          throw new Error(`Config request failed: ${response.status}`);
        }

        setDisplayDuration(data.config?.image_display_duration ?? 5000);

        setFadeDuration(data.config?.fade_duration ?? 400);

        const versionCheck = data.config?.version_check;

        if (typeof versionCheck === "number" && versionCheck > 0) {
          setVersionCheckInterval(versionCheck);

          console.log(`[CONFIG] version_check = ${versionCheck}ms`);
        } else {
          console.warn(
            `[CONFIG] Invalid version_check. Using fallback ${DEFAULT_VERSION_CHECK_INTERVAL_MS}ms`,
          );

          setVersionCheckInterval(DEFAULT_VERSION_CHECK_INTERVAL_MS);
        }
      } catch (error) {
        console.warn(
          "[CONFIG] Failed to load configuration. Using defaults.",
          error,
        );

        setVersionCheckInterval(DEFAULT_VERSION_CHECK_INTERVAL_MS);
      }
    };

    loadConfig();
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Load orientation
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const loadOrientation = async () => {
      const saved = await AsyncStorage.getItem("orientation");

      if (saved === "Portrait" || saved === "Landscape") {
        setOrientation(saved);
      }
    };

    loadOrientation();
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Load whatever media is already available
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const loadPlaylist = async () => {
      try {
        const items = await loadAvailablePlaylist();

        if (items.length === 0) {
          console.error("[PLAYER] No media found");

          setMode("empty");

          return;
        }

        console.log(`[PLAYER] Loaded ${items.length} available media item(s)`);

        playlistRef.current = items;

        setPlaylist(items);

        currentIndexRef.current = 0;

        setCurrentIndex(0);

        setMode(items[0].type);
      } catch (error) {
        console.error("[PLAYER] Failed to load local playlist:", error);

        setMode("empty");
      }
    };

    loadPlaylist();
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Watch background downloads
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const state = await getMediaDownloadState();

        // Background download failed.
        if (state.status === "error" && !downloadErrorShownRef.current) {
          downloadErrorShownRef.current = true;

          const retry = await registerMediaRetryFailure();

          const showRetry = !retry.blocked;

          if (retry.blocked) {
            const minutes = Math.max(
              1,
              Math.ceil((retry.blockedUntil - Date.now()) / 60000),
            );

            Alert.alert(
              "Network Connectivity Issues",
              `Please check your internet connection and try again in ${minutes} minutes.`,
              [
                {
                  text: "OK",
                },
              ],
            );
          } else {
            Alert.alert(
              "Network Connectivity Issues",
              "Network connectivity issues, please try again.",
              [
                {
                  text: "Retry",
                  onPress: () => {
                    router.replace(LOGIN_ROUTE);
                  },
                },
              ],
            );
          }

          return;
        }

        const available = await loadAvailablePlaylist();

        // Nothing new.
        if (available.length === playlistRef.current.length) {
          return;
        }

        if (available.length === 0) {
          return;
        }

        console.log(
          `[PLAYER] New media available: ${available.length} item(s)`,
        );

        playlistRef.current = available;

        setPlaylist(available);

        // Do NOT reset currentIndex.
        // Do NOT replace the current video.
        //
        // If one video was playing and a second
        // arrives, the existing video continues.
      } catch (error) {
        console.warn("[PLAYER] Failed to check download state:", error);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Adjust looping behavior
  //
  // One available video:
  //     loop = true
  //
  // More than one:
  //     loop = false
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (mode !== "video") {
      return;
    }

    player.loop = playlistRef.current.length === 1;
  }, [mode, playlist.length, player]);

  // ─────────────────────────────────────────────────────────────────────────
  // Play current video
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (mode !== "video") {
      return;
    }

    const item = playlistRef.current[currentIndexRef.current];

    if (!item || !item.localUri) {
      return;
    }

    const play = async () => {
      try {
        console.log(`[PLAYER] Playing: ${item.key}`);

        player.loop = playlistRef.current.length === 1;

        await player.replaceAsync(item.localUri);

        player.play();
      } catch (error) {
        console.error("[PLAYER] Failed to play video:", item.key, error);
      }
    };

    play();
  }, [mode, currentIndex, player]);

  // ─────────────────────────────────────────────────────────────────────────
  // Advance video
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const subscription = player.addListener("playToEnd", () => {
      const items = playlistRef.current;

      if (items.length === 0) {
        return;
      }

      // One video should be handled by
      // native loop, so this is mainly for
      // playlists containing multiple items.
      if (items.length === 1) {
        return;
      }

      const nextIndex = (currentIndexRef.current + 1) % items.length;

      currentIndexRef.current = nextIndex;

      setCurrentIndex(nextIndex);

      setMode(items[nextIndex].type);

      void cleanupPendingFiles(items[nextIndex].localUri);
    });

    return () => subscription.remove();
  }, [player]);

  // ─────────────────────────────────────────────────────────────────────────
  // Clean obsolete files
  // ─────────────────────────────────────────────────────────────────────────

  const cleanupPendingFiles = async (activeLocalUri?: string) => {
    if (pendingDeleteRef.current.length === 0) {
      return;
    }

    const files = pendingDeleteRef.current;

    await deletePlaylistFiles(files, activeLocalUri);

    // Keep only files that could not be deleted
    // because they were still active.
    pendingDeleteRef.current = files.filter((file) => file === activeLocalUri);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Refresh playlist from server
  // ─────────────────────────────────────────────────────────────────────────

  const refreshPlaylist = async () => {
    if (refreshRunningRef.current) {
      return;
    }

    refreshRunningRef.current = true;

    try {
      console.log("[REFRESH] Checking playlist version...");

      const result = await refreshPreparedPlaylist();

      if (!result.changed) {
        console.log("[REFRESH] Playlist unchanged");

        return;
      }

      console.log(
        `[REFRESH] Playlist updated: ${result.playlist.length} item(s)`,
      );

      const currentItem = playlistRef.current[currentIndexRef.current];

      pendingDeleteRef.current = result.oldFilesToDelete;

      const currentKey = currentItem?.key;

      playlistRef.current = result.playlist;

      setPlaylist(result.playlist);

      const newIndex = result.playlist.findIndex(
        (item) => item.key === currentKey,
      );

      if (newIndex >= 0) {
        currentIndexRef.current = newIndex;

        setCurrentIndex(newIndex);

        // Current media still exists.
        // Let it finish naturally.
      } else {
        // Current media was removed.
        currentIndexRef.current = 0;

        setCurrentIndex(0);

        if (result.playlist.length > 0) {
          setMode(result.playlist[0].type);
        } else {
          setMode("empty");
        }
      }

      await cleanupPendingFiles(currentItem?.localUri);
    } catch (error) {
      console.warn(
        "[REFRESH] Playlist refresh failed. Keeping current playlist.",
        error,
      );
    } finally {
      refreshRunningRef.current = false;
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Version check timer
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    console.log(`[VERSION CHECK] Running every ${versionCheckInterval}ms`);

    const interval = setInterval(() => {
      void refreshPlaylist();
    }, versionCheckInterval);

    return () => clearInterval(interval);
  }, [versionCheckInterval]);

  // ─────────────────────────────────────────────────────────────────────────
  // Image playback
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (mode !== "image") {
      return;
    }

    const item = playlistRef.current[currentIndexRef.current];

    if (!item) {
      return;
    }

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
    }, displayDuration);

    return () => clearTimeout(timer);
  }, [mode, currentIndex, displayDuration, fadeDuration, fadeAnim]);

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  const renderMedia = () => {
    if (mode === "loading") {
      return <Text style={styles.statusText}>Loading media...</Text>;
    }

    if (mode === "empty") {
      return <Text style={styles.statusText}>No media available.</Text>;
    }

    const currentItem = playlist[currentIndex];

    if (!currentItem) {
      return null;
    }

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

  const cardStyle =
    orientation === "Portrait" ? styles.portraitCard : styles.landscapeCard;

  return (
    <View style={styles.screen}>
      <View style={cardStyle}>{renderMedia()}</View>
    </View>
  );
};
