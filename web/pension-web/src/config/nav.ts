import type { ComponentType, SVGProps } from "react";
import {
  IconLayoutDashboardFilled,
  IconMap2,
  IconUserFilled,
  IconUsersGroup,
} from "@tabler/icons-react";

import { P, type PermissionCode } from "@/lib/shared/permission-codes";

export type NavIcon = ComponentType<SVGProps<SVGSVGElement>>;

/** A route inside a collapsible group. */
export interface NavChild {
  /** Message key under `nav.items`. */
  key: string;
  href: string;
  icon: NavIcon;
  anyOf: readonly PermissionCode[];
  /** Divider label (`nav.groups.<category>`) shown above the first child of a new category. */
  category?: string;
}

/**
 * One sidebar row: a leaf (`href`) or a collapsible group (`items`), as in Chikitsa-Raj.
 * Icons are the tabler `*Filled` variants (docs/UI_GUIDELINES.md §8).
 */
export interface NavItem {
  /** Message key under `nav.items`; also the id the drag-reorder order is saved under. */
  key: string;
  href?: string;
  icon: NavIcon;
  /** Any of these shows the item AND opens the page (NavAccessGuard). Empty: every signed-in user. */
  anyOf: readonly PermissionCode[];
  /** Children of a collapsible group. A group shows when at least one child is visible. */
  items?: NavChild[];
  /** Only the exact path is active (Dashboard), not every path under it. */
  exact?: boolean;
}

/**
 * The sidebar, in order.
 *
 * Phase 0B - Masters and administration:
 * Districts, Centers, Users
 *
 * Additional modules will be added after their screens are implemented.
 */
export const NAV: NavItem[] = [
  {
    key: "dashboard",
    href: "/dashboard",
    icon: IconLayoutDashboardFilled,
    anyOf: [
      P.DASHBOARD_STATE_VIEW,
      P.DASHBOARD_DISTRICT_VIEW,
      P.DASHBOARD_CENTER_VIEW,
    ],
    exact: true,
  },

  {
    key: "masters",
    icon: IconMap2,
    anyOf: [P.MASTER_DISTRICT_VIEW, P.MASTER_CENTER_VIEW],
    items: [
      {
        key: "districts",
        href: "/dashboard/masters/districts",
        icon: IconMap2,
        anyOf: [P.MASTER_DISTRICT_VIEW],
      },
      {
        key: "centers",
        href: "/dashboard/masters/centers",
        icon: IconMap2,
        anyOf: [P.MASTER_CENTER_VIEW],
      },
    ],
  },

  {
    key: "administration",
    icon: IconUsersGroup,
    anyOf: [P.USER_ACCOUNT_VIEW],
    items: [
      {
        key: "users",
        href: "/dashboard/users",
        icon: IconUserFilled,
        anyOf: [P.USER_ACCOUNT_VIEW],
      },
    ],
  },

  {
    key: "profile",
    href: "/dashboard/profile",
    icon: IconUserFilled,
    anyOf: [],
  },
];

const allowed = (
  anyOf: readonly string[],
  permissions: readonly string[],
): boolean =>
  anyOf.length === 0 ||
  anyOf.some((p) => permissions.includes(p));

export const navVisible = (
  item: { anyOf: readonly string[] },
  permissions: readonly string[],
): boolean => allowed(item.anyOf, permissions);

/** The items the active role may see; a group keeps only its visible children and hides when none remain. */
export const visibleNavItems = (
  permissions: readonly string[],
): NavItem[] =>
  NAV.flatMap((item) => {
    if (!item.items) {
      return allowed(item.anyOf, permissions) ? [item] : [];
    }

    const items = item.items.filter((c) =>
      allowed(c.anyOf, permissions),
    );

    return items.length
      ? [{ ...item, items }]
      : [];
  });

const under = (href: string, pathname: string) =>
  pathname === href || pathname.startsWith(`${href}/`);

export const isActive = (
  item: { href?: string; exact?: boolean },
  pathname: string,
): boolean =>
  !!item.href &&
  (item.exact ? pathname === item.href : under(item.href, pathname));

/** Every routable entry, leaves and group children alike. */
const routes = (): (NavItem | NavChild)[] =>
  NAV.flatMap<(NavItem | NavChild)>((item) =>
    item.items ? [...item.items] : [item],
  );

 /** The nav entry that owns a path (longest matching href), for the access guard and breadcrumbs. */
export const navItemFor = (
  pathname: string,
): NavItem | NavChild | undefined =>
  routes()
    .filter(
      (i): i is (NavItem | NavChild) & { href: string } =>
        !!i.href,
    )
    .sort((a, b) => b.href.length - a.href.length)
    .find((i) => under(i.href, pathname));

export interface Crumb {
  label: string;
  href?: string;
}

/** Breadcrumb trail per route: Dashboard first, then the section, then a detail page's own label. */
export const breadcrumbsFor = (
  pathname: string,
  t: (key: string) => string,
): Crumb[] => {
  const home: Crumb = {
    label: t("items.dashboard"),
    href: "/dashboard",
  };

  if (pathname === "/dashboard") return [home];

  const item = navItemFor(pathname);

  if (!item || item.href === "/dashboard") {
    return [home];
  }

  const section: Crumb = {
    label: t(`items.${item.key}`),
    href: item.href,
  };

  if (pathname === item.href) {
    return [home, { label: section.label }];
  }

  return [
    home,
    section,
    { label: t("detail") },
  ];
};
