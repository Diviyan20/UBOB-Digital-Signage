import {
  OutletImageItem,
  fetchAndCacheOutletImages,
  getCachedOutletImages,
} from "@/services/OutletImageService";
import { OutletImageStyle } from "@/styling/OutletImageStyle";
import { Image } from "expo-image";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Animated, Text, View, useWindowDimensions } from "react-native";
import { config } from "../api/client";

const ITEMS_PER_PAGE = 7;

export const OutletDisplayComponent: React.FC<{ endpoint?: string }> =
  React.memo(({ endpoint }) => {
    const { width, height } = useWindowDimensions();
    const styles = OutletImageStyle(width, height);

    const [images, setImages] = useState<OutletImageItem[]>([]);
    const [ready, setReady] = useState(false); // true only when images are in storage
    const [currentPage, setCurrentPage] = useState(0);
    const [flipInterval, setFlipInterval] = useState(5000);
    const [fadeDuration, setFadeDuration] = useState(400);

    const flipAnim = useRef(new Animated.Value(0)).current;
    const isMounted = useRef(true);

    const pages = useMemo(() => {
      const result: OutletImageItem[][] = [];
      for (let i = 0; i < images.length; i += ITEMS_PER_PAGE) {
        result.push(images.slice(i, i + ITEMS_PER_PAGE));
      }
      return result;
    }, [images]);

    const loadImages = useCallback(async () => {
      setReady(false);

      // Step 1: Show cached images immediately (already valid data URIs)
      const cached = await getCachedOutletImages();
      if (isMounted.current && cached.length > 0) {
        setImages(cached);
        setReady(true);
      }

      // Step 2: Fetch fresh — blocks until ALL images are saved to AsyncStorage
      try {
        const fresh = await fetchAndCacheOutletImages(endpoint);
        if (isMounted.current) {
          setImages(fresh);
          setReady(true);
        }
      } catch (err) {
        console.error("[OUTLET IMAGE FETCH ERROR]", err);
        // Fall back to cache if fetch fails — already shown above
        if (isMounted.current && !ready) {
          setReady(true);
        }
      }
    }, [endpoint]);

    useEffect(() => {
      isMounted.current = true;
      loadImages();
      return () => {
        isMounted.current = false;
      };
    }, [loadImages]);

    // Config fetch
    useEffect(() => {
      const fetchConfig = async () => {
        try {
          const response = await fetch(config);
          const data = await response.json();
          setFlipInterval(data.config.outlet_image_flip_interval);
          setFadeDuration(data.config.fade_duration);
        } catch (e) {
          console.error("CONFIG ERROR:", e);
        }
      };
      fetchConfig();
    }, []);

    // Flip animation
    useEffect(() => {
      if (pages.length <= 1) return;

      const interval = setInterval(() => {
        Animated.timing(flipAnim, {
          toValue: 0.5,
          duration: fadeDuration,
          useNativeDriver: true,
        }).start(() => {
          setCurrentPage((prev) => (prev + 1) % pages.length);
          Animated.timing(flipAnim, {
            toValue: 0,
            duration: fadeDuration,
            useNativeDriver: true,
          }).start();
        });
      }, flipInterval);

      return () => clearInterval(interval);
    }, [pages.length, flipAnim, fadeDuration, flipInterval]);

    const opacity = flipAnim.interpolate({
      inputRange: [0, 0.5],
      outputRange: [1, 0],
    });

    const scale = flipAnim.interpolate({
      inputRange: [0, 0.5],
      outputRange: [1, 0.92],
    });

    // Hold render until images are ready — no placeholder flashing
    if (!ready || images.length === 0) {
      return <Text>Loading Images...</Text>;
    }

    const currentItems = pages[currentPage] || [];

    return (
      <View style={styles.container}>
        <View style={styles.cardFrame}>
          <Animated.View
            style={[styles.pageContainer, { opacity, transform: [{ scale }] }]}
          >
            {currentItems.map((item, i) => {
              const imageId = item.id || `image-${i}`;

              return (
                <View
                  key={imageId}
                  style={{ alignItems: "center", marginHorizontal: 8 }}
                >
                  <Animated.View
                    style={[
                      styles.imageWrapper,
                      {
                        shadowOpacity: flipAnim.interpolate({
                          inputRange: [0, 0.5],
                          outputRange: [0.2, 0],
                        }),
                        backgroundColor: flipAnim.interpolate({
                          inputRange: [0, 0.5],
                          outputRange: ["#ffffff", "transparent"],
                        }),
                      },
                    ]}
                  >
                    {/* dataUri is a data:image/png;base64 string — no file system needed */}
                    <Image
                      source={{ uri: item.dataUri }}
                      style={styles.image}
                      contentFit="cover"
                      cachePolicy="memory"
                      recyclingKey={imageId}
                      priority="normal"
                    />
                  </Animated.View>

                  <Text
                    style={{
                      textAlign: "center",
                      marginTop: 6,
                      fontSize: 11,
                      fontWeight: "bold",
                      color: "#333",
                      width: Math.min(85, width * 0.15),
                      lineHeight: 12,
                      textTransform: "uppercase",
                    }}
                    numberOfLines={2}
                    ellipsizeMode="tail"
                  >
                    {item.outlet_name || "Unnamed Outlet"}
                  </Text>
                </View>
              );
            })}
          </Animated.View>
        </View>
      </View>
    );
  });
