import {
  fetchPromotions,
  MediaItem,
  syncPromotions,
} from "@/frontend/services/PromotionService";

import { ImageStyles } from "@/styling/MediaStyles";
import { Image } from "expo-image";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { Text, useWindowDimensions, View } from "react-native";

import { api } from "../api/client";

const DEV_BLOCK_PROMOTIONS = false;

const FALLBACK_IMAGE = require("../images/Logo.png");

const PROMOTION_CHECK_INTERVAL_MS = 30 * 1000;

export const ImageComponent: React.FC = React.memo(() => {
  const { width, height } = useWindowDimensions();

  const styles = ImageStyles(width, height);

  const [mediaList, setMediaList] = useState<MediaItem[]>([]);

  const [currentIndex, setCurrentIndex] = useState(0);

  const [loading, setLoading] = useState(true);

  const [errorVisible, setErrorVisible] = useState(false);

  const [displayDuration, setDisplayDuration] = useState(5000);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isMounted = useRef(true);

  // ============================================================
  // CONFIGURATION
  // ============================================================

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const response = await fetch(api.config);

        if (!response.ok) {
          throw new Error(`Config request failed: ${response.status}`);
        }

        const data = await response.json();

        const duration = data.config?.image_display_duration;

        if (typeof duration === "number" && duration > 0) {
          setDisplayDuration(duration);
        }
      } catch (error) {
        console.warn("[PROMOTION] Failed to load display config.", error);
      }
    };

    void loadConfig();
  }, []);

  // ============================================================
  // INITIAL PROMOTION LOAD
  // ============================================================

  useEffect(() => {
    isMounted.current = true;

    const loadPromotions = async () => {
      try {
        console.log("[IMAGE COMPONENT] Loading promotions...");

        if (DEV_BLOCK_PROMOTIONS) {
          throw new Error("DEV_BLOCK");
        }

        const media = await fetchPromotions();

        if (!isMounted.current) {
          return;
        }

        setMediaList(media);
        setCurrentIndex(0);
        setErrorVisible(media.length === 0);
      } catch (error) {
        console.error("[IMAGE COMPONENT] Failed to load promotions:", error);

        if (!isMounted.current) {
          return;
        }

        setMediaList([
          {
            image: null,
            name: "",
            localFallback: FALLBACK_IMAGE,
          },
        ]);

        setCurrentIndex(0);
        setErrorVisible(true);
      } finally {
        if (isMounted.current) {
          setLoading(false);
        }
      }
    };

    void loadPromotions();

    return () => {
      isMounted.current = false;
    };
  }, []);

  // ============================================================
  // PERIODIC ODOO CHECK
  // ============================================================

  useEffect(() => {
    const checkPromotions = async () => {
      try {
        console.log("[PROMOTION] Running periodic Odoo check...");

        const media = await syncPromotions();

        if (!isMounted.current) {
          return;
        }

        setMediaList(media);

        setCurrentIndex((current) => {
          if (media.length === 0) {
            return 0;
          }

          return Math.min(current, media.length - 1);
        });

        setErrorVisible(media.length === 0);
      } catch (error) {
        console.warn("[PROMOTION] Periodic promotion check failed:", error);
      }
    };

    const timer = setInterval(() => {
      void checkPromotions();
    }, PROMOTION_CHECK_INTERVAL_MS);

    return () => clearInterval(timer);
  }, []);

  // ============================================================
  // IMAGE CYCLING
  // ============================================================

  const advanceOnce = useCallback(() => {
    if (mediaList.length <= 1) {
      return;
    }

    setCurrentIndex((previous) => (previous + 1) % mediaList.length);
  }, [mediaList.length]);

  useEffect(() => {
    if (mediaList.length === 0) {
      return;
    }

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      advanceOnce();

      intervalRef.current = setInterval(advanceOnce, displayDuration);
    }, displayDuration);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [mediaList.length, advanceOnce, displayDuration]);

  // ============================================================
  // CURRENT MEDIA
  // ============================================================

  const currentMedia = useMemo(
    () => mediaList[currentIndex],
    [mediaList, currentIndex],
  );

  // ============================================================
  // ERROR / EMPTY STATE
  // ============================================================

  if (!currentMedia) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Text>{loading ? "Loading media..." : "No active promotions."}</Text>

        {errorVisible && (
          <View
            style={{
              position: "absolute",
              bottom: 20,
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 16,
              paddingVertical: 10,
              borderRadius: 8,
            }}
          >
            <Text
              style={{
                fontSize: 11,
                marginRight: 8,
              }}
            >
              ⚠️
            </Text>

            <Text
              style={{
                color: "#000",
                fontSize: 11,
                fontWeight: "bold",
              }}
            >
              Network issues, undergoing repairs
            </Text>
          </View>
        )}
      </View>
    );
  }

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <View style={styles.card}>
      {currentMedia.localFallback ? (
        <Image
          source={currentMedia.localFallback}
          style={styles.image}
          contentFit="contain"
        />
      ) : currentMedia.image ? (
        <Image
          source={{
            uri: currentMedia.image,
          }}
          style={styles.image}
          contentFit="contain"
          transition={170}
          cachePolicy="memory-disk"
          recyclingKey={`media-${currentIndex}`}
        />
      ) : (
        <Text style={styles.placeholderText}>No Image</Text>
      )}

      <View style={styles.textContainer}>
        <Text style={styles.title}>{currentMedia.name || "Untitled"}</Text>
      </View>
    </View>
  );
});
