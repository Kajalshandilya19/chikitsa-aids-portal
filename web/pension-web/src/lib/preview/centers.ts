import type { Center, District, PlaceRef } from "@/lib/api-types";

export type CenterType = "ART" | "LAC" | "COE" | "OTHER";

export interface PreviewCenterInput {
  code: string;
  name_en: string;
  name_hi: string | null;
  district_id: string;
  center_type: CenterType;
  soch_facility_code: string | null;
}

export const PREVIEW_DISTRICTS: District[] = [
  { id: "00000000-0000-4000-8000-000000000101", lgd_code: 90001, code: "DEMO-D01", name_en: "Demo Jaipur District", name_hi: "डेमो जयपुर जिला", is_active: true },
  { id: "00000000-0000-4000-8000-000000000102", lgd_code: 90002, code: "DEMO-D02", name_en: "Demo Ajmer District", name_hi: "डेमो अजमेर जिला", is_active: true },
  { id: "00000000-0000-4000-8000-000000000103", lgd_code: 90003, code: "DEMO-D03", name_en: "Demo Kota District", name_hi: "डेमो कोटा जिला", is_active: true },
];

const districtRef = (id: string): PlaceRef | null => {
  const district = PREVIEW_DISTRICTS.find((item) => item.id === id);
  return district
    ? { id: district.id, code: district.code, name_en: district.name_en, name_hi: district.name_hi }
    : null;
};

const demoCenter = (
  id: string,
  code: string,
  name: string,
  districtId: string,
  centerType: CenterType,
  active: boolean,
  placeholder = false,
): Center => ({
  id,
  code,
  name_en: name,
  name_hi: null,
  center_type: centerType,
  soch_facility_code: `DEMO-SOCH-${code}`,
  is_active: active,
  is_placeholder: placeholder,
  district: districtRef(districtId),
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
});

export const PREVIEW_CENTERS: Center[] = [
  demoCenter("00000000-0000-4000-8000-000000001001", "DM001", "Demo ART Centre One", PREVIEW_DISTRICTS[0]!.id, "ART", true),
  demoCenter("00000000-0000-4000-8000-000000001002", "DM002", "Demo Link Centre Two", PREVIEW_DISTRICTS[1]!.id, "LAC", true, true),
  demoCenter("00000000-0000-4000-8000-000000001003", "DM003", "Demo Excellence Centre Three", PREVIEW_DISTRICTS[2]!.id, "COE", false),
  demoCenter("00000000-0000-4000-8000-000000001004", "DM004", "Demo ART Centre Four", PREVIEW_DISTRICTS[0]!.id, "ART", true),
  demoCenter("00000000-0000-4000-8000-000000001005", "DM005", "Demo Other Centre Five", PREVIEW_DISTRICTS[1]!.id, "OTHER", true),
  demoCenter("00000000-0000-4000-8000-000000001006", "DM006", "Demo Link Centre Six", PREVIEW_DISTRICTS[2]!.id, "LAC", true),
];

let centers = PREVIEW_CENTERS;
const listeners = new Set<() => void>();

export function getPreviewCenters(): Center[] {
  return centers;
}

export function subscribeToPreviewCenters(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function publish(next: Center[]) {
  centers = next;
  listeners.forEach((listener) => listener());
}

export function savePreviewCenter(updated: Center): void {
  publish(centers.map((center) => center.id === updated.id ? { ...updated } : center));
}

export function setPreviewCenterActive(id: string, isActive: boolean): void {
  publish(centers.map((center) => center.id === id
    ? { ...center, is_active: isActive, updated_at: new Date().toISOString() }
    : center));
}

export function upsertPreviewCenters(inputs: PreviewCenterInput[]): void {
  const next = [...centers];
  for (const input of inputs) {
    const district = districtRef(input.district_id);
    if (!district) continue;
    const index = next.findIndex((center) => center.code === input.code);
    if (index >= 0) {
      next[index] = {
        ...next[index]!,
        ...input,
        district,
        updated_at: new Date().toISOString(),
      };
      continue;
    }
    next.push({
      id: crypto.randomUUID(),
      ...input,
      district,
      is_active: true,
      is_placeholder: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }
  publish(next);
}
