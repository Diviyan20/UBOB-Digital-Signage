import { MediaStyles as styles } from "@/styling/MediaStyles";
import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, Image, Text, View } from "react-native";
import ErrorOverlayComponent from "./ErrorOverlayComponent";

interface MediaItem {
  name?: string;
  description?: string;
  image?: string | null;
  date_start?: string;
  date_end?: string;
}

const SERVER_URL = "http://10.0.2.2:5000";

const ImageComponent: React.FC<{ endpoint?: string }> = ({
  endpoint = `${SERVER_URL}/current_media`,
}) => {
  const [media, setMedia] = useState<MediaItem | null>(null);
  const [nextMedia, setNextMedia] = useState<MediaItem | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorVisible, setErrorVisible] = useState(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const isTransitioning = useRef(false);

  const fetchCurrentMedia = async () => {
    try {
      if (!media) setLoading(true);

      const response = await fetch(endpoint);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();

      if (data.image && data.image !== media?.image && !isTransitioning.current) {
        isTransitioning.current = true;
        setNextMedia(data);
        fadeOutIn(data);
      } else if (!media) {
        setMedia(data);
      }
    } catch (error) {
      console.error("Media Fetch Error:", error);
      if (!media) setErrorVisible(true);
    } finally {
      setLoading(false);
    }
  };

  const fadeOutIn = (newData: MediaItem) => {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 400,
      easing: Easing.linear,
      useNativeDriver: true,
    }).start(() => {
      setMedia(newData);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        easing: Easing.linear,
        useNativeDriver: true,
      }).start(() => {
        isTransitioning.current = false;
      });
    });
  };

  useEffect(() => {
    fetchCurrentMedia();
    const interval = setInterval(fetchCurrentMedia, 5000);
    return () => clearInterval(interval);
  }, []);

  // --- Handle loading or error states ---
  if (!media) {
    if (errorVisible) {
      return (
        <ErrorOverlayComponent
          visible={errorVisible}
          errorType="media_error"
          onRetry={async () => {
            setErrorVisible(false);
            setLoading(true);
            try {
              await fetchCurrentMedia();
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

  // --- Main render once media exists ---
  const getImageUrl = (imagePath: string | null | undefined): string | null => {
    if (!imagePath) return null;
    if (imagePath.startsWith("http")) return imagePath;
    return `${SERVER_URL}${imagePath}`;
  };

  return (
    <Animated.View style={[styles.card, { opacity: fadeAnim }]}>

      {getImageUrl(media.image) ? (
        <Image
          source={{ uri: getImageUrl(media.image)! }}
          style={styles.image}
          resizeMode="contain"
        />
      ) : (
        <Text style={styles.placeholderText}>No Image</Text>
      )}


      <View style={styles.textContainer}>
        <Text style={styles.title}>{media.name || "Untitled"}</Text>
        {media.description && (
          <Text style={styles.description} numberOfLines={3}>
            {media.description}
          </Text>
        )}
        {media.date_start && (
          <Text>{new Date(media.date_start).toLocaleDateString()}</Text>
        )}
      </View>
    </Animated.View>
  );
};

export default ImageComponent;
