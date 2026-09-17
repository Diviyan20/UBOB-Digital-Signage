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

export const ImageComponent: React.FC = React.memo(() => {
  const { width, height } = useWindowDimensions();

  const styles = ImageStyles(width, height);

  const [mediaList, setMediaList] = useState<MediaItem[]>([]);

  const [currentIndex, setCurrentIndex] = useState(0);

  const [loading, setLoading] = useState(true);

  const [errorVisible, setErrorVisible] = useState(false);

  const [displayDuration, setDisplayDuration] = useState(5000);

  const [promotionRefresh, setPromotionRefresh] = useState(30000);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isMounted = useRef(true);

  // ============================================================
  // CONFIGURATION
  // ============================================================

  useEffect(() => {
    const loadConfig = async () => {
      try {
        console.log("[CONFIG] Fetching application configuration...");
        const response = await fetch(api.config);

        if (!response.ok) {
          throw new Error(`Config request failed: ${response.status}`);
        }

        const data = await response.json();

        console.log("[CONFIG] Full response:", data);
        console.log("[CONFIG] Config object:", data.config);

        const imageDuration = Number(data.data?.image_display_duration);

        const promotionRefresh = Number(data.data?.refresh_status);

        console.log(`[CONFIG] image_display_duration = ${imageDuration}ms`);

        console.log(`[CONFIG] refresh_status = ${promotionRefresh}ms`);

        if (Number.isFinite(imageDuration) && imageDuration > 0) {
          setDisplayDuration(imageDuration);
          console.log(
            `[CONFIG] Applied image display duration: ${imageDuration}ms`,
          );
        } else {
          console.warn(
            "[CONFIG] Invalid image_display_duration. Using default 5000ms.",
          );
        }

        if (Number.isFinite(promotionRefresh) && promotionRefresh > 0) {
          setPromotionRefresh(promotionRefresh);

          console.log(
            `[CONFIG] Applied promotion refresh interval: ${promotionRefresh}ms`,
          );
        } else {
          console.warn(
            "[CONFIG] Invalid refresh_status. Using default 30000ms.",
          );
        }
      } catch (error) {
        console.warn(
          "[CONFIG] Failed to load display configuration. Using defaults.",
          error,
        );
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
    console.log(
      `[PROMOTION] Starting Odoo refresh timer: ${promotionRefresh}ms`,
    );

    const checkPromotions = async () => {
      try {
        console.log("[PROMOTION] Running periodic Odoo check...");

        const media = await syncPromotions();

        if (!isMounted.current) return;

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
    }, promotionRefresh);

    return () => {
      console.log(
        `[PROMOTION] Clearing Odoo refresh timer: ${promotionRefresh}ms`,
      );

      clearInterval(timer);
    };
  }, [promotionRefresh]);

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
