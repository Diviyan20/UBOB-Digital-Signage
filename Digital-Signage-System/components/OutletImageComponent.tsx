import { OutletImageStyle } from "@/styling/OutletImageStyle";
import { Image } from "expo-image";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Easing, Text, View, useWindowDimensions } from "react-native";

interface ImageItem {
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
  const scrollX = useRef(new Animated.Value(0)).current;
  const isMounted = useRef(true);

  const ITEM_W = Math.min(220, Math.round(width * 0.22));

  const getImageUrl = useCallback((path?: string | null) => {
    if (!path) return null;
    if (path.startsWith("http")) return `${path}?t=${Date.now()}`;
    return `${SERVER_URL}${path}?t=${Date.now()}`;
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
      }
    } catch (error) {
      console.error("Image Fetch Error:", error);
      if (isMounted.current && images.length === 0) throw new Error("Error fetching Outlets.")
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }, [endpoint]);


  useEffect(() => {
    fetchOutletImages();
    return () => {
      isMounted.current = false;
      scrollX.stopAnimation();
    };
  }, [fetchOutletImages]);

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
        if (finished) loopScroll();
      });
    };

    loopScroll();
    return () => scrollX.stopAnimation();
  }, [images, width]);

  if (loading) return <Text>Loading Images....</Text>

  if (images.length === 0) return <Text>No images available.</Text>;

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
            {[...images, ...images].map((item, i) => {
              const uri = getImageUrl(item.image);
              return (
                <View key={i} style={{ alignItems: "center", marginHorizontal: 8 }}>
                  <View style={styles.imageWrapper}>
                    {uri ? (
                      <Image source={{ uri }} style={styles.image} contentFit="cover" />
                    ) : (
                      <Text style={styles.placeholder}>No Image</Text>
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
