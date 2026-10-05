"use client";

import { useSyncExternalStore } from "react";

import {
  getPreviewCenters,
  subscribeToPreviewCenters,
} from "@/lib/preview/centers";

export function usePreviewCenters() {
  return useSyncExternalStore(
    subscribeToPreviewCenters,
    getPreviewCenters,
    getPreviewCenters,
  );
}
