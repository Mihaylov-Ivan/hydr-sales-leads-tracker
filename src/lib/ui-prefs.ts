"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

/** Read a JSON value from localStorage, or return fallback. */
export function readUiPref<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw == null || raw === "") return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Write a JSON value to localStorage (best-effort). */
export function writeUiPref(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode / quota — ignore
  }
}

/**
 * Persist React state in localStorage.
 * Skips writing until after the initial hydrate so defaults never wipe stored prefs.
 */
export function useUiPref<T>(
  key: string,
  initial: T,
): [T, Dispatch<SetStateAction<T>>, boolean] {
  const [value, setValue] = useState<T>(initial);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setValue(readUiPref(key, initial));
    setReady(true);
    // initial is intentional mount default only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (!ready) return;
    writeUiPref(key, value);
  }, [key, ready, value]);

  return [value, setValue, ready];
}

/** Encode a multi-select: "all" when unrestricted, else id list. */
export function encodeIdFilter(
  ids: Set<string> | null,
  allSelected: boolean,
): "all" | string[] {
  if (ids === null || allSelected) return "all";
  return [...ids];
}

/** Decode a multi-select: null means “all / default”. */
export function decodeIdFilter(
  raw: unknown,
): Set<string> | null {
  if (raw == null || raw === "all") return null;
  if (!Array.isArray(raw)) return null;
  const ids = raw.filter((x): x is string => typeof x === "string");
  return new Set(ids);
}
