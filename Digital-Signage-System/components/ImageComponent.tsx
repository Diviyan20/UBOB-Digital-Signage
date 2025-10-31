import { MediaStyles } from "@/styling/MediaStyles";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Image,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import ErrorOverlayComponent from "./ErrorOverlayComponent";

interface MediaItem {
  name?: string;
  description?: string;
  image?: string | null;
  date_start?: string;
  date_end?: string;
}

const SERVER_URL = "http://localhost:5000";

const ImageComponent: React.FC<{ endpoint?: string }> = ({
  endpoint = `${SERVER_URL}/get_media`,
}) => {
  const { width, height } = useWindowDimensions();
  const styles = MediaStyles(width, height);

  const [mediaList, setMediaList] = useState<MediaItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errorVisible, setErrorVisible] = useState(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const intervalRef =  useRef<ReturnType<typeof setInterval> | null>(null);

  const FADE_DURATION = 500;
  const DISPLAY_DURATION = 6000;

  // --- Fetch media list ---
  const fetchMediaList = async () => {
    try {
      const response = await fetch(endpoint);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();

      const items = data.media || [];
      if (items.length === 0) throw new Error("No Media found");

      setMediaList(items);
      setErrorVisible(false);
    } catch (err) {
      console.error("Media Fetch Error:", err);
      if (mediaList.length === 0) setErrorVisible(true);
    } finally {
      setLoading(false);
    }
  };

  // --- Fade Transition ---
  const advanceOnce = () => {
    if (mediaList.length <= 1) return;

    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: FADE_DURATION,
      easing: Easing.linear,
      useNativeDriver: true,
    }).start(() => {
      // Once fade-out completes → switch image
      setCurrentIndex((prev) => (prev + 1) % mediaList.length);

      // Fade in next image
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: FADE_DURATION,
        easing: Easing.linear,
        useNativeDriver: true,
      }).start();
    });
  };

  // --- Carousel logic ---
  useEffect(() => {
    // clear old interval if any
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (mediaList.length === 0) return;

    fadeAnim.setValue(1);

    const totalInterval = DISPLAY_DURATION + FADE_DURATION * 2;

    intervalRef.current = setInterval(() => {
      advanceOnce();
    }, totalInterval);

    // trigger first transition after DISPLAY_DURATION
    const firstTimeout = setTimeout(() => {
      advanceOnce();
    }, DISPLAY_DURATION);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      clearTimeout(firstTimeout);
    };
  }, [mediaList]);

  // --- Initial Fetch ---
  useEffect(() => {
    fetchMediaList();
  }, []);

  // --- Helpers ---
  const getImageUrl = (imagePath: string | null | undefined): string | null => {
    if (!imagePath) return null;
    if (imagePath.startsWith("http")) return `${imagePath}?t=${Date.now()}`;
    return `${SERVER_URL}${imagePath}?t=${Date.now()}`;
  };

  const currentMedia = mediaList[currentIndex];

  // --- Error + Loading states ---
  if (!currentMedia) {
    if (errorVisible) {
      return (
        <ErrorOverlayComponent
          visible={errorVisible}
          errorType="media_error"
          onRetry={async () => {
            setErrorVisible(false);
            setLoading(true);
            try {
              await fetchMediaList();
            } finally {
              setLoading(false);
            }
          }}
        />
      );
    }

    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <Text>Loading media...</Text>
      </View>
    );
  }

  // --- Render ---
  return (
    <Animated.View style={[styles.card, { opacity: fadeAnim }]}>
      {getImageUrl(currentMedia.image) ? (
        <Image
          source={{ uri: getImageUrl(currentMedia.image)! }}
          style={styles.image}
          resizeMode="contain"
        />
      ) : (
        <Text style={styles.placeholderText}>No Image</Text>
      )}

      <View style={styles.textContainer}>
        <Text style={styles.title}>{currentMedia.name || "Untitled"}</Text>
        {currentMedia.description && (
          <Text style={styles.description} numberOfLines={3}>
            {currentMedia.description}
          </Text>
        )}
      </View>
    </Animated.View>
  );
};

export default ImageComponent;
