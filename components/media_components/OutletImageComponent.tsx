import { OutletImageStyle } from "@/styling/OutletImageStyle";
import { Image } from "expo-image";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Animated,
  Easing,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { api } from "../api/client";

interface ImageItem {
  id?: string;
  image?: string | null;
  outlet_name?: string;
  outlet_id?: string;
}

const PREFETCH_BUFFER = 5;

const OutletDisplayComponent: React.FC<{ endpoint?: string }> = React.memo(
  ({ endpoint = api.outletImages }) => {
    const { width, height } = useWindowDimensions();
    const styles = OutletImageStyle(width, height);

    const [images, setImages] = useState<ImageItem[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());

    const scrollX = useRef(new Animated.Value(0)).current;
    const isMounted = useRef(true);
    const abortControllerRef = useRef<AbortController | null>(null);
    const prefetchCache = useRef<Set<string>>(new Set());

    const ITEM_W = useMemo(
      () => Math.min(220, Math.round(width * 0.22)),
      [width],
    );

    const getImageUrl = useCallback(
      (path?: string | null, bustCache = false) => {
        if (!path) return null;
        if (path.startsWith("http://") || path.startsWith("https://")) {
          return bustCache ? `${path}?t=${Date.now()}` : path;
        }
        // Fallback only for relative paths
        return bustCache
          ? `${api.outletImages}${path}?t=${Date.now()}`
          : `${api.outletImages}${path}`;
      },
      [],
    );

    const smartPrefetchForMarquee = useCallback(() => {
      if (images.length === 0) return;

      const urlsToPrefetch: string[] = [];
      for (let i = 0; i < Math.min(PREFETCH_BUFFER, images.length); i++) {
        const url = getImageUrl(images[i]?.image);
        if (url && !prefetchCache.current.has(url)) {
          urlsToPrefetch.push(url);
          prefetchCache.current.add(url);
        }
      }

      if (urlsToPrefetch.length > 0) {
        Promise.all(
          urlsToPrefetch.map((url) => Image.prefetch(url).catch(() => null)),
        ).catch(() => null);
      }
    }, [images, getImageUrl]);

    const fetchOutletImages = useCallback(async () => {
      if (abortControllerRef.current) abortControllerRef.current.abort();
      abortControllerRef.current = new AbortController();

      try {
        setLoading(true);

        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        const items: ImageItem[] = Array.isArray(data?.media) ? data.media : [];

        if (isMounted.current) {
          setImages(items);
          setImageErrors(new Set());
          prefetchCache.current.clear();
        }
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
        console.error("Outlet image fetch error:", error);
        if (isMounted.current) setImages([]);
      } finally {
        if (isMounted.current) setLoading(false);
      }
    }, [endpoint]);

    useEffect(() => {
      isMounted.current = true;
      fetchOutletImages();

      return () => {
        isMounted.current = false;
        scrollX.stopAnimation();
        if (abortControllerRef.current) abortControllerRef.current.abort();
      };
    }, [fetchOutletImages, scrollX]);

    useEffect(() => {
      if (images.length > 0) smartPrefetchForMarquee();
    }, [images, smartPrefetchForMarquee]);

    useEffect(() => {
      if (images.length === 0) return;

      const itemWidth = ITEM_W + 8;
      const originalWidth = images.length * itemWidth;
      const duration = Math.max(12000, originalWidth * 25);

      const animate = () => {
        Animated.timing(scrollX, {
          toValue: -originalWidth,
          duration,
          easing: Easing.linear,
          useNativeDriver: true,
        }).start(({ finished }) => {
          if (finished && isMounted.current) {
            scrollX.setValue(0);
            smartPrefetchForMarquee();
            animate();
          }
        });
      };

      scrollX.setValue(0);
      animate();

      return () => scrollX.stopAnimation();
    }, [images.length, ITEM_W, scrollX, smartPrefetchForMarquee]);

    const handleImageError = useCallback((imageId: string) => {
      setImageErrors((prev) => {
        const next = new Set(prev);
        next.add(imageId);
        return next;
      });
    }, []);

    if (loading) return <Text>Loading Images...</Text>;
    if (images.length === 0) return <Text>No images available.</Text>;

    const duplicatedImages = [...images, ...images];

    return (
      <View style={styles.container}>
        <View style={styles.cardFrame}>
          <View style={styles.marqueeWrapper}>
            <Animated.View
              style={[
                styles.marqueeInner,
                { transform: [{ translateX: scrollX }] },
              ]}
            >
              {duplicatedImages.map((item, i) => {
                const imageId = item.id || item.outlet_id || `image-${i}`;
                const uri = getImageUrl(item.image);
                const hasError = imageErrors.has(imageId);

                return (
                  <View
                    key={`${imageId}-${i}`}
                    style={{ alignItems: "center", marginHorizontal: 8 }}
                  >
                    <View style={styles.imageWrapper}>
                      {uri && !hasError ? (
                        <Image
                          source={{ uri }}
                          style={styles.image}
                          contentFit="cover"
                          transition={200}
                          cachePolicy="memory-disk"
                          recyclingKey={imageId}
                          onError={() => handleImageError(imageId)}
                        />
                      ) : (
                        <View
                          style={[
                            styles.image,
                            {
                              justifyContent: "center",
                              alignItems: "center",
                              backgroundColor: "#f0f0f0",
                            },
                          ]}
                        >
                          <Text style={styles.placeholder}>No Image</Text>
                        </View>
                      )}
                    </View>

                    <Text
                      style={{
                        textAlign: "center",
                        marginTop: 6,
                        fontSize: 11,
                        fontWeight: "bold",
                        color: "#333",
                        flexWrap: "wrap",
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
      </View>
    );
  },
);

OutletDisplayComponent.displayName = "OutletDisplayComponent";
export default OutletDisplayComponent;
