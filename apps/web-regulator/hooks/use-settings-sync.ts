"use client";

import { useEffect, useCallback, useRef } from "react";

/**
 * useSettingsSync — Cross-tab synchronization hook for dashboard settings.
 *
 * Listens for `storage` events (fired when localStorage changes in another tab)
 * and provides a function to broadcast settings changes to all tabs.
 *
 * Use this alongside useKillSwitchWebSocket to ensure consistent admin experience
 * when multiple dashboard tabs are open.
 */

const SETTINGS_SYNC_PREFIX = "alygn:settings:";

export type SettingsSyncHandler = (key: string, value: string | null) => void;

export function useSettingsSync(
  onSettingChanged?: SettingsSyncHandler,
): {
  broadcastSetting: (key: string, value: string) => void;
  clearSetting: (key: string) => void;
} {
  const handlerRef = useRef(onSettingChanged);
  handlerRef.current = onSettingChanged;

  useEffect(() => {
    function handleStorageChange(e: StorageEvent) {
      if (!e.key) return;

      // Only handle our prefixed settings keys
      if (e.key.startsWith(SETTINGS_SYNC_PREFIX)) {
        const settingKey = e.key.slice(SETTINGS_SYNC_PREFIX.length);
        handlerRef.current?.(settingKey, e.newValue);
      }
    }

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  const broadcastSetting = useCallback((key: string, value: string) => {
    // Writing to localStorage in the current tab fires the storage event
    // in all other tabs — this is how cross-tab sync works.
    // Use a temp write + immediate delete trick to ensure the event fires
    // even if the value is the same.
    const storageKey = `${SETTINGS_SYNC_PREFIX}${key}`;
    const previous = localStorage.getItem(storageKey);

    if (previous === value) {
      // Force-trigger by clearing first, then setting in next microtask
      localStorage.removeItem(storageKey);
      queueMicrotask(() => {
        localStorage.setItem(storageKey, value);
      });
    } else {
      localStorage.setItem(storageKey, value);
    }
  }, []);

  const clearSetting = useCallback((key: string) => {
    const storageKey = `${SETTINGS_SYNC_PREFIX}${key}`;
    localStorage.removeItem(storageKey);
  }, []);

  return { broadcastSetting, clearSetting };
}
