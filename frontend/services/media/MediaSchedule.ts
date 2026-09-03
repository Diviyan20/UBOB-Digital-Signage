import { PlaylistItems } from "./MediaTypes";

// =============================================================================
// Daily schedule
// =============================================================================

/**
 * Extract HH:mm from the timestamp used by Daily schedules.
 *
 * Daily schedules use a placeholder date:
 *
 * 1970-01-01T15:15:00+00:00
 *
 * The date is irrelevant.
 * Only the UTC clock time matters.
 */
const getDailyTimeMinutes = (value: string): number | null => {
  if (!value) return null;

  const match = value.match(
    /T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?$/,
  );

  if (match) {
    const hours = Number(match[1]);
    const minutes = Number(match[2]);

    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return hours * 60 + minutes;
    }
  }

  return null;
};

/**
 * Checks whether the current UTC time is inside a Daily window.
 *
 * Supports:
 *
 * 10:00 -> 14:00
 * 23:00 -> 02:00
 */

const isDailyActive = (
  startValue: string,
  endValue: string,
  now: Date,
): boolean => {
  const startMinutes = getDailyTimeMinutes(startValue);
  const endMinutes = getDailyTimeMinutes(endValue);

  if (startMinutes === null || endMinutes === null) return false;

  const nowMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();

  // Same time means all day
  if (startMinutes === endMinutes) return true;

  // Normal window
  if (startMinutes < endMinutes) {
    return nowMinutes >= startMinutes && nowMinutes <= endMinutes;
  }

  // Cross-midnight window
  return nowMinutes >= startMinutes || nowMinutes <= endMinutes;
};

// =============================================================================
// LTO schedule
// =============================================================================

/**
 * LTO uses real calendar dates.
 *
 * Example:
 *
 * 2026-08-20T15:00:00+00:00
 * ->
 * 2026-08-25T20:00:00+00:00
 */

const isLtoActive = (
  startValue: string,
  endValue: string,
  now: Date,
): boolean => {
  const start = new Date(startValue);
  const end = new Date(endValue);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return false;
  }

  return now.getTime() >= start.getTime() && now.getTime() <= end.getTime();
};

// =============================================================================
// Public schedule API
// =============================================================================

/**
 * Returns true when a media item should currently be playable.
 */

export const isMediaScheduleNow = (
  item: PlaylistItems,
  now = new Date(),
): boolean => {
  switch (item.frequency) {
    case "Evergreen":
      return true;

    case "Daily":
      if (!item.startDatetime || !item.endDatetime) {
        console.warn(
          `[SCHEDULE] ${item.fileName} is Daily but has no start/end time`,
        );
        return false;
      }

      return isDailyActive(item.startDatetime, item.endDatetime, now);

    case "LTO":
      if (!item.startDatetime || !item.endDatetime) {
        console.warn(
          `[SCHEDULE] ${item.fileName} is LTO but has no start/end date`,
        );
        return false;
      }

      return isLtoActive(item.startDatetime, item.endDatetime, now);

    default:
      console.warn(`[SCHEDULE] Unknown frequency: ${item.frequency}`);
      return false;
  }
};

/**
 * Filters a complete downloaded media collection down
 * to media that is currently active.
 */
export const getPlayableMedia = (
  media: PlaylistItems[],
  now = new Date(),
): PlaylistItems[] => {
  const playable = media.filter((item) => {
    const active = isMediaScheduleNow(item, now);

    console.log(
      `[SCHEDULE] ${item.fileName} | ` +
        `frequency=${item.frequency} | ` +
        `start=${item.startDatetime ?? "-"} | ` +
        `end=${item.endDatetime ?? "-"} | ` +
        `active=${active}`,
    );

    return active;
  });

  console.log(
    `[SCHEDULE] ${playable.length}/${media.length} media item(s) currently active`,
  );

  return playable;
};
