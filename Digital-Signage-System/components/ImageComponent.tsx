import { MediaStyles as styles } from "@/styling/MediaStyles";
import React, { useEffect, useRef, useState } from "react";
import { Alert, Animated, Easing, Image, Text, View } from "react-native";

interface MediaItem {
  name?: string;
  description?: string;
  image?: string | null;
  date_start?: string;
  date_end?: string;
}


const ImageComponent: React.FC<{ endpoint?: string }> = ({
  endpoint = "http://127.0.0.1:5000/current_media",
}) => {
  const [media, setMedia] = useState<MediaItem | null>(null);
  const[nextMedia, setNextMedia] = useState<MediaItem | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const isTransitioning = useRef(false);


  const fetchCurrentMedia = async () => {
    try {
      if (!media) setLoading(true);

      const response = await fetch(endpoint);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      if (data.image && data.image !== media?.image && !isTransitioning.current) {
        isTransitioning.current = true;
        setNextMedia(data);
        fadeOutIn(data);
      } else if (!media){
        setMedia(data);
      }
      
    } catch (error) {
      console.error("Media Fetch Error:", error);
      if (!media) {
        Alert.alert(
          "Connection Error",
          "Could not load media. Please try again later."
        );
      }
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
      // After fade out completes, swap image
      setMedia(newData);

      // Fade back in
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
    const interval = setInterval(fetchCurrentMedia, 5000); // poll every 5s
    return () => clearInterval(interval);
  }, []);

  if (!media) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No media available.</Text>
      </View>
    );
  }

  const imageUri =
    typeof media.image === "string" && media.image.length > 50
      ? media.image
      : null;

  return (
    <Animated.View style={[styles.card, { opacity: fadeAnim }]}>
      {imageUri ? (
        <Image
          source={{ uri: imageUri }}
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
              <Text style={styles.date}>
                {new Date(media.date_start).toLocaleDateString()}
              </Text>
            )}
          </View>
    </Animated.View>
  );
};

export default ImageComponent;
