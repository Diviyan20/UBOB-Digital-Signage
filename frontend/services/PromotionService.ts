import { api } from "@/frontend/components/api/client";
import AsyncStorage from "@react-native-async-storage/async-storage";

const MEDIA_CACHE_KEY = "promotion_media_cache";

export interface MediaItem {
  name?: string;
  description?: string;
  image?: string | null;
  date_start?: string;
  date_end?: string;
  localFallback?: any;
}

interface MediaCache {
  media: MediaItem[];
  cachedAt: number;
}

// ============================================================
// DATE HANDLING
// ============================================================

/**
 * Odoo returns datetime values without a timezone offset.
 *
 * Example:
 * 2026-12-31T15:59:59
 *
 * Odoo datetimes are treated as UTC.
 */
const parseOdooDate = (value?: string | null): Date | null => {
  if (!value) {
    return null;
  }

  const normalized = value.trim();

  // Explicitly treat timezone-less Odoo datetimes as UTC.
  const utcValue = normalized.endsWith("Z") ? normalized : `${normalized}Z`;

  const parsed = new Date(utcValue);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
};

/**
 * Determines whether a promotion is currently valid.
 *
 * Rules:
 *
 * - No start date → valid immediately
 * - No end date → remains valid indefinitely
 * - Current time must be >= start date
 * - Current time must be <= end date
 */
export const isPromotionActive = (
  promotion: MediaItem,
  now: Date = new Date(),
): boolean => {
  const start = parseOdooDate(promotion.date_start);

  const end = parseOdooDate(promotion.date_end);

  if (promotion.date_start && !start) {
    console.warn(
      `[PROMOTION] Invalid start date for ${promotion.name}: ${promotion.date_start}`,
    );

    return false;
  }

  if (promotion.date_end && !end) {
    console.warn(
      `[PROMOTION] Invalid end date for ${promotion.name}: ${promotion.date_end}`,
    );

    return false;
  }

  // Promotion has not started yet.
  if (start && now < start) {
    return false;
  }

  // Promotion has expired.
  if (end && now > end) {
    return false;
  }

  return true;
};

/**
 * Remove expired / invalid promotions from a list.
 */
const filterActivePromotions = (media: MediaItem[]): MediaItem[] => {
  return media.filter((promotion) => isPromotionActive(promotion));
};

// ============================================================
// LOCAL STORAGE
// ============================================================

const savePromotionCache = async (media: MediaItem[]): Promise<void> => {
  await AsyncStorage.setItem(
    MEDIA_CACHE_KEY,
    JSON.stringify({
      media,
      cachedAt: Date.now(),
    } satisfies MediaCache),
  );
};

const loadPromotionCache = async (): Promise<MediaItem[]> => {
  try {
    const raw = await AsyncStorage.getItem(MEDIA_CACHE_KEY);

    if (!raw) {
      return [];
    }

    const parsed: MediaCache = JSON.parse(raw);

    if (!Array.isArray(parsed.media)) {
      return [];
    }

    return parsed.media;
  } catch (error) {
    console.warn("[PROMOTION] Failed to read promotion cache:", error);

    return [];
  }
};

/**
 * Loads cached promotions and immediately removes
 * anything that has expired according to the TV's clock.
 *
 * This means expired promotions disappear even when
 * the TV temporarily has no network connection.
 */
export const loadActiveCachedPromotions = async (): Promise<MediaItem[]> => {
  const cached = await loadPromotionCache();

  const active = filterActivePromotions(cached);

  // Rewrite storage so expired promotions are removed.
  await savePromotionCache(active);

  console.log(
    `[PROMOTION] Cached: ${cached.length} | Active: ${active.length}`,
  );

  return active;
};

// ============================================================
// ODOO
// ============================================================

/**
 * Fetch the current promotion list directly
 * from the backend, which fetches Odoo.
 */
const fetchPromotionsFromOdoo = async (): Promise<MediaItem[]> => {
  const response = await fetch(api.promotions);

  if (!response.ok) {
    throw new Error(`Promotion request failed: HTTP ${response.status}`);
  }

  const data = await response.json();

  return Array.isArray(data.media) ? data.media : [];
};

/**
 * Synchronize the TV cache with the current
 * promotion data from Odoo.
 *
 * Valid:
 *   Keep in cache.
 *
 * Invalid / expired:
 *   Remove from cache.
 *
 * New valid promotion:
 *   Add to cache.
 */
export const syncPromotions = async (): Promise<MediaItem[]> => {
  try {
    console.log("[PROMOTION] Checking Odoo promotions...");

    const promotions = await fetchPromotionsFromOdoo();

    const activePromotions = filterActivePromotions(promotions);

    await savePromotionCache(activePromotions);

    console.log(
      `[PROMOTION] Odoo: ${promotions.length} | ` +
        `Active: ${activePromotions.length}`,
    );

    return activePromotions;
  } catch (error) {
    console.warn(
      "[PROMOTION] Odoo check failed. " +
        "Cleaning local cache using current time.",
      error,
    );

    return loadActiveCachedPromotions();
  }
};

/**
 * Initial promotion load.
 *
 * We check Odoo immediately.
 * If the network fails, the app falls back
 * to the valid local cache.
 */
export const fetchPromotions = async (): Promise<MediaItem[]> => {
  return syncPromotions();
};

// ============================================================
// CLEAR CACHE
// ============================================================

export const clearPromotionCache = async (): Promise<void> => {
  await AsyncStorage.removeItem(MEDIA_CACHE_KEY);

  console.log("[PROMOTION] Local promotion cache cleared");
};
