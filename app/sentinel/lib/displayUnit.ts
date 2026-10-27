"use client";

// Sentinel - the display unit as a React hook: one choice for the whole section, remembered in this browser.
// The conversions themselves are in displayUnitCore.ts. Pages convert with fromCrore (peer figures, always
// held in crore) or fromCompany (a company's own statement figures, held in its reporting unit).

import { useCallback, useSyncExternalStore } from "react";
import { displayFormat, parseDisplayUnit, type DisplayFormat, type DisplayUnit } from "./displayUnitCore";

export { DISPLAY_UNITS, type DisplayUnit } from "./displayUnitCore";

const KEY = "sentinel.displayUnit";
let current: DisplayUnit = "as_reported";
let initialised = false;
const listeners = new Set<() => void>();

function init() {
  if (initialised || typeof window === "undefined") return;
  initialised = true;
  try {
    current = parseDisplayUnit(window.localStorage.getItem(KEY));
  } catch {
    current = "as_reported";
  }
}
function subscribe(fn: () => void) {
  init();
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const snapshot = () => {
  init();
  return current;
};

export function setDisplayUnit(unit: DisplayUnit) {
  if (unit === current) return;
  current = unit;
  try {
    window.localStorage.setItem(KEY, unit);
  } catch {
    /* not remembered */
  }
  listeners.forEach((l) => l());
}

export function useDisplayUnit(): DisplayFormat & { setUnit: (u: DisplayUnit) => void } {
  const unit = useSyncExternalStore(subscribe, snapshot, () => "as_reported" as DisplayUnit);
  const setUnit = useCallback((u: DisplayUnit) => setDisplayUnit(u), []);
  return { ...displayFormat(unit), setUnit };
}
