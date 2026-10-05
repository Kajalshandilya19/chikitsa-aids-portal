"use client";

import { useSyncExternalStore } from "react";

import {
  getPreviewUsers,
  subscribeToPreviewUsers,
} from "@/lib/preview/users";

export function usePreviewUsers() {
  return useSyncExternalStore(
    subscribeToPreviewUsers,
    getPreviewUsers,
    getPreviewUsers,
  );
}
