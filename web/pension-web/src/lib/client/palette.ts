// KPI accent palettes (same set as Chikitsa-Raj reports).
export interface ReportPalette {
  card: string; // hover border + subtle bg tint
  iconWrap: string; // icon chip bg + text
  text: string; // accent text (the card's "Open report" link)
}
export const REPORT_PALETTES: ReportPalette[] = [
  {
    card: "hover:border-sky-500/70 hover:bg-sky-500/5",
    iconWrap: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
    text: "text-sky-600 dark:text-sky-400",
  },
  {
    card: "hover:border-violet-500/70 hover:bg-violet-500/5",
    iconWrap: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
    text: "text-violet-600 dark:text-violet-400",
  },
  {
    card: "hover:border-emerald-500/70 hover:bg-emerald-500/5",
    iconWrap: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    text: "text-emerald-600 dark:text-emerald-400",
  },
  {
    card: "hover:border-amber-500/70 hover:bg-amber-500/5",
    iconWrap: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    text: "text-amber-600 dark:text-amber-400",
  },
  {
    card: "hover:border-rose-500/70 hover:bg-rose-500/5",
    iconWrap: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
    text: "text-rose-600 dark:text-rose-400",
  },
  {
    card: "hover:border-cyan-500/70 hover:bg-cyan-500/5",
    iconWrap: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400",
    text: "text-cyan-600 dark:text-cyan-400",
  },
];

export const paletteFor = (i: number): ReportPalette => REPORT_PALETTES[((i % REPORT_PALETTES.length) + REPORT_PALETTES.length) % REPORT_PALETTES.length]!;
