import { OutletImageStyle } from "@/styling/OutletImageStyle";
import { Image } from "expo-image";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Easing, Text, View, useWindowDimensions } from "react-native";

interface ImageItem {
  id?: string;
  image?: string | null;
  outlet_name?: string;
  outlet_id?: string;
}

const SERVER_URL = "http://10.0.2.2:5000";

const OutletDisplayComponent: React.FC<{ endpoint?: string }> = ({
  endpoint = `${SERVER_URL}/outlet_image_combined`,
}) => {
  const { width, height } = useWindowDimensions();
  const imageSize = Math.min(85, width * 0.15);
  const styles = OutletImageStyle(width, height);

  const [images, setImages] = useState<ImageItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());
  const scrollX = useRef(new Animated.Value(0)).current;
  const isMounted = useRef(true);

  const ITEM_W = Math.min(220, Math.round(width * 0.22));

  // Helper to form valid image URL (without cache-busting for better caching)
  const getImageUrl = useCallback((path?: string | null, bustCache = false) => {
    if (!path) return null;
    if (path.startsWith("http")) {
      return bustCache ? `${path}?t=${Date.now()}` : path;
    }
    return bustCache 
      ? `${SERVER_URL}${path}?t=${Date.now()}` 
      : `${SERVER_URL}${path}`;
  }, []);

  const fetchOutletImages = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const items = data.media || [];

      if (items.length === 0) throw new Error("No Images found");
      if (isMounted.current) {
        setImages(items);
        setImageErrors(new Set()); // Reset errors when fetching new images
      }
    } catch (error) {
      console.error("Image Fetch Error:", error);
      if (isMounted.current && images.length === 0) {
        // Don't throw, just log the error
        console.error("Error fetching Outlets:", error);
      }
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }, [endpoint, images.length]);

  // Prefetch all images when they're loaded
  useEffect(() => {
    if (images.length === 0) return;

    // Prefetch all images in parallel
    const prefetchPromises = images
      .map(item => getImageUrl(item.image))
      .filter(url => url !== null)
      .map(url => Image.prefetch(url!).catch((err) => {
        console.warn("⚠️ Prefetch failed for", url, err);
        return null;
      }));

    Promise.all(prefetchPromises).then((results) => {
      const successCount = results.filter(r => r !== null).length;
      console.log(`✅ Prefetched ${successCount}/${images.length} outlet images`);
    });
  }, [images, getImageUrl]);

  useEffect(() => {
    isMounted.current = true;
    fetchOutletImages();
    return () => {
      isMounted.current = false;
      scrollX.stopAnimation();
    };
  }, []);

  useEffect(() => {
    if (images.length === 0) return;

    const totalWidth = images.length * (ITEM_W + 18);
    const duration = totalWidth * 25;

    const loopScroll = () => {
      scrollX.setValue(0);
      Animated.timing(scrollX, {
        toValue: -totalWidth,
        duration,
        easing: Easing.linear,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished && isMounted.current) loopScroll();
      });
    };

    loopScroll();
    return () => scrollX.stopAnimation();
  }, [images, width, ITEM_W]);

  const handleImageError = useCallback((imageId: string) => {
    setImageErrors(prev => new Set(prev).add(imageId));
  }, []);

  if (loading) return <Text>Loading Images....</Text>;

  if (images.length === 0) return <Text>No images available.</Text>;

  // Create duplicated array for seamless loop
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
                <View key={`${imageId}-${i}`} style={{ alignItems: "center", marginHorizontal: 8 }}>
                  <View style={styles.imageWrapper}>
                    {uri && !hasError ? (
                      <Image
                        source={{ uri }}
                        style={styles.image}
                        contentFit="cover"
                        transition={200}
                        cachePolicy="memory-disk"
                        onError={(error) => {
                          console.warn(`Image load error for ${item.outlet_name} (${imageId}):`, error);
                          handleImageError(imageId);
                        }}
                        onLoadStart={() => {
                          // Remove from errors if it starts loading successfully
                          if (imageErrors.has(imageId)) {
                            setImageErrors(prev => {
                              const next = new Set(prev);
                              next.delete(imageId);
                              return next;
                            });
                          }
                        }}
                        recyclingKey={imageId} // Help with image recycling
                      />
                    ) : (
                      <View style={[styles.image, { justifyContent: "center", alignItems: "center", backgroundColor: "#f0f0f0" }]}>
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
                      lineHeight: 10,
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
};

export default OutletDisplayComponent;
