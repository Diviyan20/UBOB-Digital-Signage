import { useCallback, useEffect, useMemo, useState } from "react";
import {
    getMediaRetryState,
    registerMediaRetryFailure,
} from "../services/MediaService";

/**
 * Maximum number of network retry attempts allowed before
 * the login button enters its cooldown period.
 */
const MAX_RETRIES = 5;

/**
 * Keeps all retry/cooldown state in one place.
 *
 * The login form does not need to know how AsyncStorage,
 * retry counters, or cooldown timestamps work.
 */
export const useLoginRetry = () => {
  const [retryCount, setRetryCount] = useState(0);
  const [blockedUntil, setBlockedUntil] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(0);

  /**
   * Load persisted retry state when the login screen mounts.
   *
   * This means restarting the app does not bypass an active cooldown.
   */
  useEffect(() => {
    const loadRetryState = async () => {
      try {
        const state = await getMediaRetryState();

        setRetryCount(state.retryCount);
        setBlockedUntil(state.blockedUntil);
      } catch (error) {
        console.warn("[RETRY] Failed to load retry state:", error);
      }
    };

    void loadRetryState();
  }, []);

  /**
   * Countdown timer.
   *
   * The actual source of truth is the absolute timestamp stored in
   * `blockedUntil`. We derive the displayed seconds from that timestamp.
   */
  useEffect(() => {
    if (!blockedUntil) {
      setRemainingSeconds(0);
      return;
    }

    const updateCountdown = () => {
      const remainingMs = blockedUntil - Date.now();

      if (remainingMs <= 0) {
        setRemainingSeconds(0);
        setBlockedUntil(0);
        setRetryCount(0);
        return;
      }

      setRemainingSeconds(Math.ceil(remainingMs / 1000));
    };

    updateCountdown();

    const timer = setInterval(updateCountdown, 1000);

    return () => clearInterval(timer);
  }, [blockedUntil]);

  /**
   * Whether the login button should currently be disabled
   * because the retry cooldown is active.
   */
  const isBlocked = remainingSeconds > 0;

  /**
   * Format:
   *
   * 299 -> 04:59
   * 65  -> 01:05
   * 5   -> 00:05
   */
  const formattedCooldown = useMemo(() => {
    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;

    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(
      2,
      "0",
    )}`;
  }, [remainingSeconds]);

  /**
   * Text displayed inside the login button.
   */
  const buttonText = isBlocked ? `Retry in ${formattedCooldown}` : "Log In";

  /**
   * Register a failed network attempt.
   *
   * Returns the number of tries remaining so the caller can
   * display the appropriate alert.
   */
  const registerFailure = useCallback(async () => {
    const result = await registerMediaRetryFailure();

    setRetryCount(result.retryCount);
    setBlockedUntil(result.blockedUntil);

    return {
      ...result,
      triesLeft: result.blocked
        ? 0
        : Math.max(0, MAX_RETRIES - result.retryCount),
    };
  }, []);

  /**
   * Reset only the UI state.
   *
   * The actual persisted retry state is deliberately controlled
   * by MediaService.
   */
  const clearCooldown = useCallback(() => {
    setBlockedUntil(0);
    setRemainingSeconds(0);
    setRetryCount(0);
  }, []);

  return {
    retryCount,
    remainingSeconds,
    isBlocked,
    buttonText,
    registerFailure,
    clearCooldown,
  };
};
