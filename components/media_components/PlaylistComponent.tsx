import { loadPreparedPlaylist, PlaylistItems } from "@/services/MediaService";
import { PlaylistStyles as styles } from "@/styling/MediaStyles";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Text,
  View
} from "react-native";
import { config } from "../api/client";

type PlaybackMode = "loading" | "video" | "image" | "empty";
type OrientationType = "Landscape" | "Portrait";

export const PlaylistComponent: React.FC = () => {
  const [playlist, setPlaylist] = useState<PlaylistItems[]>([]);
  const [mode, setMode] = useState<PlaybackMode>("loading");

  const [currentIndex, setCurrentIndex] = useState(0);

  const [displayDuration, setDisplayDuration] = useState(5000);
  const [fadeDuration, setFadeDuration] = useState(400);
  const [orientation, setOrientation] = useState<OrientationType>("Landscape");

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const currentIndexRef = useRef(0);
  const playlistRef = useRef<PlaylistItems[]>([]);

  const player = useVideoPlayer(null, (p) => {
    p.loop = false;
  });

  /*
  ─────────────────────────────────────────────────────────────────────────
  LOAD CONFIGURATION ONCE
  ─────────────────────────────────────────────────────────────────────────
  */
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
      } catch (error) {
        console.warn("[CONFIG] Using default playback settings:", error);
      }
    };

    loadConfig();
  }, []);

  /*
   ─────────────────────────────────────────────────────────────────────────
   LOAD ORIENTATION
   ─────────────────────────────────────────────────────────────────────────
   */
  useEffect(() => {
    const loadOrientation = async () => {
      // Import only what we actually need here.
      const AsyncStorage =
        require("@react-native-async-storage/async-storage").default;

      const saved = await AsyncStorage.getItem("orientation");

      if (saved === "Portrait" || saved === "Landscape") {
        setOrientation(saved);
      }
    };

    loadOrientation();
  }, []);

  /*
   ─────────────────────────────────────────────────────────────────────────
   LOAD PREPARED PLAYLIST
   ─────────────────────────────────────────────────────────────────────────
   */

  useEffect(() => {
    const loadPlaylist = async () => {
      try {
        const items = await loadPreparedPlaylist();

        if (items.length === 0) {
          console.error("[PLAYER] No prepared media found");

          setMode("empty");
          return;
        }

        console.log(`[PLAYER] Loaded ${items.length} prepared media item(s)`);

        playlistRef.current = items;
        setPlaylist(items);
        currentIndexRef.current = 0;
        setCurrentIndex(0);

        const firstItem = items[0];

        setMode(firstItem.type);
      } catch (error) {
        console.error("[PLAYER] Failed to load local playlist:", error);

        setMode("empty");
      }
    };

    loadPlaylist();
  }, []);

  /*
   ─────────────────────────────────────────────────────────────────────────
    PLAY CURRENT VIDEO
   ─────────────────────────────────────────────────────────────────────────
   */
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

        player.loop = false;

        await player.replaceAsync(item.localUri);

        player.play();
      } catch (error) {
        console.error("[PLAYER] Failed to play video:", item.key, error);
      }
    };

    play();
  }, [mode, currentIndex, player]);

  /*
   ─────────────────────────────────────────────────────────────────────────
    MOVE TO NEXT VIDEO ITEM WHEN VIDEO FINISHES
   ─────────────────────────────────────────────────────────────────────────
   */
  useEffect(() => {
    const subscription = player.addListener("playToEnd", () => {
      const items = playlistRef.current;

      if (items.length === 0) {
        return;
      }

      const nextIndex = (currentIndexRef.current + 1) % items.length;

      currentIndexRef.current = nextIndex;

      setCurrentIndex(nextIndex);
      setMode(items[nextIndex].type);
    });

    return () => subscription.remove();
  }, [player]);

  /*
   ─────────────────────────────────────────────────────────────────────────
    IMAGE PLAYBACK
   ─────────────────────────────────────────────────────────────────────────
   */
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

  // ─── Render ───────────────────────────────────────────────────────────────
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
