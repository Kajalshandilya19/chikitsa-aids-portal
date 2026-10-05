"use client";

import { useSyncExternalStore } from "react";

import {
  getPreviewBeneficiaries,
  subscribeToPreviewBeneficiaries,
} from "@/lib/preview/beneficiaries";

export function usePreviewBeneficiaries() {
  return useSyncExternalStore(
    subscribeToPreviewBeneficiaries,
    getPreviewBeneficiaries,
    getPreviewBeneficiaries,
  );
}
