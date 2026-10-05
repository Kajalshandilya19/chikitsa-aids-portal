"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type * as React from "react";
import { geoMercator, geoPath } from "d3-geo";
import { feature, merge } from "topojson-client";
import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";
import {
  IconClipboardCheckFilled,
  IconCoinRupeeFilled,
  IconFileInvoiceFilled,
  IconMapPinFilled,
  IconShieldCheckFilled,
  IconUserFilled,
} from "@tabler/icons-react";

import { GovtRajasthanLogo } from "@/components/auth/govt-rajasthan-logo";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Left panel of the sign-in card (desktop only), ported from the SETU / Chikitsa-Raj login:
 *   - top: the headline (auth.heroTitle / heroSubtitle);
 *   - the Rajasthan district map (TopoJSON, public/geo/districts/rajasthan.json) with a west to
 *     east draw-in and a "beacon" district that glows and moves on;
 *   - the portal's capabilities orbiting a dashed ring in front of the map, as FILLED icons;
 *   - the Government of Rajasthan lockup at the centre (as on SETU / Chikitsa-Raj).
 * Hovering a district shows its name; clicking one sends a ripple. All colours are theme tokens
 * (var(--primary)), so the panel follows the red theme and dark mode. Motion is off under
 * prefers-reduced-motion.
 */

const RAJASTHAN_URL = "/geo/districts/rajasthan.json";
const VB_W = 520;
const VB_H = 480;
const PAD = 8;
const ORBIT_SECONDS = 45;
const BEACON_MS = 1600;

type IconComponent = React.ComponentType<React.SVGProps<SVGSVGElement>>;
// TopoJSON features: properties are whatever the file carries (district name).
type Feature = { type: "Feature"; properties: Record<string, unknown>; geometry: unknown };
type Topology = { objects: Record<string, { geometries: unknown[] }> };

const CHIPS: { key: string; icon: IconComponent }[] = [
  { key: "chipBeneficiaries", icon: IconUserFilled },
  { key: "chipVerification", icon: IconClipboardCheckFilled },
  { key: "chipPpo", icon: IconFileInvoiceFilled },
  { key: "chipPayments", icon: IconCoinRupeeFilled },
  { key: "chipSecure", icon: IconShieldCheckFilled },
];

function useRajasthanTopo() {
  return useQuery({
    queryKey: ["geo-topo-raw", RAJASTHAN_URL],
    queryFn: async () => {
      const res = await fetch(RAJASTHAN_URL);
      const topo = (await res.json()) as Topology;
      const key = Object.keys(topo.objects)[0] as string;
      const fc = feature(topo as never, topo.objects[key] as never) as unknown as { features: Feature[] };
      return { topo, objectKey: key, features: fc.features };
    },
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

function OrbitChips({ reduce }: { reduce: boolean }) {
  const t = useTranslations("auth");
  return (
    <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 size-[min(21rem,40svh)] -translate-x-1/2 -translate-y-1/2 xl:size-[min(24rem,44svh)]">
      {CHIPS.map(({ key, icon: Icon }, i) => {
        const angle = (360 / CHIPS.length) * i;
        const delay = `-${(ORBIT_SECONDS * angle) / 360}s`;
        return (
          <div key={key} className="login-orbit absolute inset-0" style={{ transform: `rotate(${angle}deg)`, animationDelay: delay }}>
            <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2">
              <div className="login-orbit-counter" style={{ transform: `rotate(-${angle}deg)`, animationDelay: delay }}>
                <motion.div
                  initial={reduce ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.9 + i * 0.1, duration: 0.45 }}
                  className="flex flex-col items-center gap-1.5 text-center"
                >
                  <span className="grid size-11 place-items-center rounded-full bg-primary text-primary-foreground shadow-md ring-4 ring-card/70">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <span
                    className="whitespace-nowrap text-[11px] font-semibold leading-tight text-foreground/90"
                    style={{ textShadow: "0 1px 5px color-mix(in srgb, var(--card) 82%, transparent)" }}
                  >
                    {t(key)}
                  </span>
                </motion.div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface Hover {
  x: number;
  y: number;
  name: string;
}

interface Ripple {
  id: number;
  x: number;
  y: number;
}

export function LoginMapPanel() {
  const t = useTranslations("auth");
  // Read the motion preference only after mount, so the server HTML and the first client render
  // agree (otherwise a reduced-motion browser gets a hydration mismatch).
  const prefersReduced = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const reduce = mounted ? (prefersReduced ?? false) : false;
  const { data } = useRajasthanTopo();
  const [hover, setHover] = useState<Hover | null>(null);
  const [beacon, setBeacon] = useState<number | null>(null);
  const [flash, setFlash] = useState<number | null>(null);
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const rippleId = useRef(0);
  const stageRef = useRef<HTMLDivElement>(null);

  const map = useMemo(() => {
    if (!data) return null;
    const fc = { type: "FeatureCollection", features: data.features };
    const projection = geoMercator().fitExtent(
      [
        [PAD, PAD],
        [VB_W - PAD, VB_H - PAD],
      ],
      fc as never,
    );
    const pathFor = geoPath(projection);
    const ranked = data.features
      .map((f) => ({
        d: pathFor(f as never) ?? "",
        name: String(f.properties.district ?? ""),
        centroid: pathFor.centroid(f as never) as [number, number],
      }))
      .sort((a, b) => a.centroid[0] - b.centroid[0])
      .map((entry, rank) => ({ ...entry, rank }));
    const object = data.topo.objects[data.objectKey] as { geometries: unknown[] };
    const outlineD = pathFor(merge(data.topo as never, object.geometries as never) as never) ?? "";
    return { ranked, outlineD };
  }, [data]);

  const count = map?.ranked.length ?? 0;

  useEffect(() => {
    if (reduce || count === 0) return;
    const id = setInterval(() => {
      setBeacon((prev) => {
        let next = prev;
        while (next === prev) next = Math.floor(Math.random() * count);
        return next;
      });
    }, BEACON_MS);
    return () => clearInterval(id);
  }, [reduce, count]);

  useEffect(() => {
    if (flash === null) return;
    const id = setTimeout(() => setFlash(null), 900);
    return () => clearTimeout(id);
  }, [flash]);

  const fillFor = (rank: number, name: string) => {
    if (hover?.name === name || flash === rank) return "color-mix(in srgb, var(--primary) 84%, black)";
    if (beacon === rank) return "color-mix(in srgb, var(--primary) 80%, black)";
    const pct = 52 + (rank / Math.max(count - 1, 1)) * 28 + (rank % 3) * 3;
    return `color-mix(in srgb, var(--primary) ${Math.round(pct)}%, var(--card))`;
  };

  const onHover = (name: string) => (e: React.MouseEvent) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (rect) setHover({ x: e.clientX - rect.left, y: e.clientY - rect.top, name });
  };

  const onDistrictClick = (rank: number, centroid: [number, number]) => {
    setFlash(rank);
    if (reduce) return;
    const id = ++rippleId.current;
    setRipples((r) => [...r, { id, x: centroid[0], y: centroid[1] }]);
  };

  return (
    <div className="relative hidden flex-col overflow-hidden border-border/60 bg-gradient-to-br from-primary/20 via-primary/10 to-primary/5 p-8 lg:flex lg:border-r lg:p-10">
      {/* Headline, as on the Chikitsa-Raj and SETU logins. */}
      <div className="text-center">
        <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground xl:text-3xl">{t("heroTitle")}</h2>
        <p className="font-display mt-1.5 text-lg font-bold xl:text-xl">
          <span className="bg-gradient-to-r from-primary to-[color-mix(in_srgb,var(--primary)_62%,black)] bg-clip-text text-transparent">{t("heroSubtitle")}</span>
        </p>
      </div>

      <div ref={stageRef} className="relative mt-6 flex min-h-[22rem] flex-1 items-center justify-center">
        <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 size-[min(21rem,40svh)] -translate-x-1/2 -translate-y-1/2 xl:size-[min(24rem,44svh)]">
          <div className="absolute inset-0 rounded-full border border-dashed border-primary/40" />
        </div>

        {!map ? (
          <Skeleton className="aspect-[13/12] w-full max-w-[min(440px,52svh)]" />
        ) : (
          <svg viewBox={`0 0 ${VB_W} ${VB_H}`} aria-hidden="true" focusable="false" className="relative w-full max-w-[min(440px,52svh)]">
            <defs>
              <clipPath id="login-raj-clip">
                <path d={map.outlineD} />
              </clipPath>
              <linearGradient id="login-sheen-grad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" style={{ stopColor: "var(--primary-foreground)", stopOpacity: 0 }} />
                <stop offset="0.5" style={{ stopColor: "var(--primary-foreground)", stopOpacity: 0.16 }} />
                <stop offset="1" style={{ stopColor: "var(--primary-foreground)", stopOpacity: 0 }} />
              </linearGradient>
            </defs>
            {map.ranked.map(({ d, name, rank, centroid }) => (
              <motion.path
                key={name || rank}
                d={d}
                initial={reduce ? false : { opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 + rank * 0.02, duration: 0.5, ease: "easeOut" }}
                fill={fillFor(rank, name)}
                stroke="var(--card)"
                strokeWidth={1}
                strokeLinejoin="round"
                className="cursor-pointer transition-[fill] duration-700 ease-in-out"
                onMouseEnter={onHover(name)}
                onMouseMove={onHover(name)}
                onMouseLeave={() => setHover(null)}
                onClick={() => onDistrictClick(rank, centroid)}
              />
            ))}
            <path d={map.outlineD} fill="none" stroke="color-mix(in srgb, var(--primary) 60%, transparent)" strokeWidth={1.25} strokeLinejoin="round" className="pointer-events-none" />
            {ripples.map(({ id, x, y }) => (
              <g key={id} className="pointer-events-none">
                <motion.circle cx={x} cy={y} fill="none" stroke="var(--primary-foreground)" strokeWidth={2.5} initial={{ r: 4, opacity: 0.9 }} animate={{ r: 46, opacity: 0 }} transition={{ duration: 0.7, ease: "easeOut" }} />
                <motion.circle
                  cx={x}
                  cy={y}
                  fill="none"
                  stroke="var(--primary)"
                  strokeWidth={2}
                  initial={{ r: 4, opacity: 0.8 }}
                  animate={{ r: 62, opacity: 0 }}
                  transition={{ duration: 0.9, delay: 0.08, ease: "easeOut" }}
                  onAnimationComplete={() => setRipples((r) => r.filter((ripple) => ripple.id !== id))}
                />
              </g>
            ))}
            <g clipPath="url(#login-raj-clip)" className="pointer-events-none">
              <rect className="login-map-sheen" width="200" height={VB_H + 120} y={-60} fill="url(#login-sheen-grad)" style={{ transform: "translateX(-240px) skewX(-12deg)" }} />
            </g>
          </svg>
        )}

        <OrbitChips reduce={reduce} />

        {/* The Government of Rajasthan lockup at the centre, lifted off the map by a soft card-toned bloom. */}
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <motion.div
            initial={reduce ? false : { opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.9, duration: 0.4, ease: "easeOut" }}
            className="grid size-44 place-items-center"
            style={{ backgroundImage: "radial-gradient(closest-side, color-mix(in srgb, var(--card) 64%, transparent) 40%, color-mix(in srgb, var(--card) 30%, transparent) 66%, transparent 100%)" }}
          >
            <GovtRajasthanLogo variant="stacked" className="text-foreground [text-shadow:0_1px_2px_color-mix(in_srgb,var(--card)_70%,transparent)]" />
          </motion.div>
        </div>

        {hover && (
          <div
            className="pointer-events-none absolute z-20 flex items-center gap-1.5 rounded-full border border-primary/40 bg-popover px-3 py-1.5 text-xs font-semibold text-popover-foreground shadow-lg"
            style={{ left: hover.x + 12, top: hover.y + 12 }}
          >
            <IconMapPinFilled className="size-3.5 text-primary" aria-hidden />
            {hover.name}
          </div>
        )}
      </div>
    </div>
  );
}
