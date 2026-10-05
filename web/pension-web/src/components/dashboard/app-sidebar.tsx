"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { IconChevronRight, IconExchangeFilled, IconLogout, IconUserFilled } from "@tabler/icons-react";
import { DndContext, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { AidsLockup, PortalMark } from "@/components/brand";
import { useScopeText } from "@/components/dashboard/dashboard-header";
import { SwitchAssignmentDialog } from "@/components/dashboard/switch-assignment-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { isActive, visibleNavItems } from "@/config/nav";
import { avatarColor } from "@/lib/avatar-color";
import { api, goToLogin } from "@/lib/client/api";
import { cn } from "@/lib/utils";
import { useSession } from "@/providers/session-provider";

/*
 * The custom nav order, by item key. A preference cookie, not browser storage (R-PII-5): it holds
 * nav keys only, and is listed with the other JS-written cookies in web/pension-web/README.md.
 */
const ORDER_COOKIE = "hp_nav_order";

const readOrder = (): string[] => {
  const m = document.cookie.match(/(?:^|; )hp_nav_order=([^;]*)/);
  return m ? decodeURIComponent(m[1]!).split(",").filter((k) => /^[a-z][a-z0-9_-]{0,40}$/.test(k)) : [];
};

const writeOrder = (keys: string[]) => {
  document.cookie = `${ORDER_COOKIE}=${encodeURIComponent(keys.join(","))}; path=/; max-age=31536000; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`;
};

const initialsOf = (name: string) =>
  name
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "U";

// A draggable nav row. The whole row is the drag source; an 8px activation
// distance means a plain click still navigates while a small drag reorders.
function SortableNavItem({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    position: "relative",
    zIndex: isDragging ? 50 : undefined,
  };
  return (
    <li ref={setNodeRef} style={style} className={`group/menu-item relative ${isDragging ? "opacity-80" : ""}`} {...attributes} {...listeners}>
      {children}
    </li>
  );
}

/** The Chikitsa-Raj sidebar: brand plate, drag-sortable nav with collapsible groups, account menu in the footer. */
export function AppSidebar(props: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const { user } = useSession();
  const { setOpenMobile } = useSidebar();
  const close = () => setOpenMobile(false);

  // Loaded after mount so SSR and the first client render agree (avoids a hydration mismatch).
  const [order, setOrder] = React.useState<string[]>([]);
  React.useEffect(() => setOrder(readOrder()), []);

  // Which nav groups are manually expanded (keyed by item key). Auto-opens when a
  // child route is active; the user can still toggle from there.
  const [openGroups, setOpenGroups] = React.useState<Record<string, boolean>>({});

  const visible = React.useMemo(() => visibleNavItems(user.permissions), [user.permissions]);

  const ordered = React.useMemo(() => {
    if (!order.length) return visible;
    const rank = (key: string) => {
      const i = order.indexOf(key);
      return i === -1 ? Number.MAX_SAFE_INTEGER : i;
    };
    return [...visible]
      .map((item, i) => ({ item, i }))
      .sort((a, b) => rank(a.item.key) - rank(b.item.key) || a.i - b.i)
      .map(({ item }) => item);
  }, [order, visible]);

  // A mouse reorders after 8px; a finger has to press and hold first, so taps and scrolls stay taps and scrolls.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 8 } }),
  );

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = ordered.map((i) => i.key);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    const next = arrayMove(ids, from, to);
    setOrder(next);
    writeOrder(next);
  };

  return (
    <Sidebar collapsible="icon" variant="inset" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip={t("brand")}>
              <div className="flex items-center justify-center">
                {/* Expanded: the RSACS lockup on a white plate, in both themes, like the Chikitsa-Raj brand
                    plate. The menu button sizes every svg inside it to size-4, so the ribbon's own
                    size is marked important; h-9 at every width keeps the plate inside the h-12 row. */}
                <Link
                  href="/dashboard"
                  onClick={close}
                  aria-label={t("brand")}
                  className="flex w-full items-center justify-center rounded-lg bg-white px-2.5 py-1 group-data-[collapsible=icon]:hidden"
                >
                  <AidsLockup className="text-neutral-900" markClassName="h-9! w-auto!" />
                </Link>
                {/* Collapsed rail: the ribbon alone. */}
                <Link
                  href="/dashboard"
                  onClick={close}
                  aria-label={t("brand")}
                  className="hidden aspect-square size-8 items-center justify-center rounded-lg bg-white p-0.5 group-data-[collapsible=icon]:flex"
                >
                  <PortalMark plain className="h-6! w-auto!" />
                </Link>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <DndContext id="hp-sidebar-dnd" sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis]} onDragEnd={onDragEnd}>
                <SortableContext items={ordered.map((i) => i.key)} strategy={verticalListSortingStrategy}>
                  {ordered.map((item) => {
                    // Collapsible group with a sub-menu of child routes.
                    if (item.items) {
                      const childActive = item.items.some((c) => isActive(c, pathname));
                      const open = openGroups[item.key] ?? childActive;
                      return (
                        <SortableNavItem key={item.key} id={item.key}>
                          <Collapsible open={open}>
                            <SidebarMenuButton
                              tooltip={t(`items.${item.key}`)}
                              isActive={!open && childActive}
                              onClick={() => setOpenGroups((p) => ({ ...p, [item.key]: !open }))}
                            >
                              <item.icon />
                              <span>{t(`items.${item.key}`)}</span>
                              <IconChevronRight className={`ml-auto size-4 shrink-0 transition-transform duration-200 ${open ? "rotate-90" : ""}`} />
                            </SidebarMenuButton>
                            <CollapsibleContent>
                              <SidebarMenuSub>
                                {item.items.map((sub, i) => {
                                  // A divider row above the first child of each new `category`; only groups that set it render any.
                                  const prevCategory = i > 0 ? item.items![i - 1]!.category : undefined;
                                  const showDivider = sub.category && sub.category !== prevCategory;
                                  return (
                                    <React.Fragment key={sub.href}>
                                      {showDivider ? (
                                        <li aria-hidden className={cn("px-1.5 pb-0.5 text-[10px] font-semibold tracking-wide text-sidebar-foreground/55 uppercase select-none", i > 0 && "mt-2")}>
                                          {t(`groups.${sub.category}`)}
                                        </li>
                                      ) : null}
                                      <SidebarMenuSubItem>
                                        <SidebarMenuSubButton asChild isActive={isActive(sub, pathname)}>
                                          <Link href={sub.href} onClick={close}>
                                            <sub.icon />
                                            <span>{t(`items.${sub.key}`)}</span>
                                          </Link>
                                        </SidebarMenuSubButton>
                                      </SidebarMenuSubItem>
                                    </React.Fragment>
                                  );
                                })}
                              </SidebarMenuSub>
                            </CollapsibleContent>
                          </Collapsible>
                        </SortableNavItem>
                      );
                    }

                    // Leaf destination.
                    return (
                      <SortableNavItem key={item.key} id={item.key}>
                        <SidebarMenuButton asChild isActive={isActive(item, pathname)} tooltip={t(`items.${item.key}`)}>
                          <Link href={item.href!} onClick={close}>
                            <item.icon />
                            <span>{t(`items.${item.key}`)}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SortableNavItem>
                    );
                  })}
                </SortableContext>
              </DndContext>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <UserMenu />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function UserMenu() {
  const t = useTranslations("workspace");
  const { user } = useSession();
  const { state, isMobile, setOpenMobile } = useSidebar();
  const { role, place } = useScopeText(user);
  const [switching, setSwitching] = React.useState(false);
  const name = user.name || user.user_code;
  const initials = initialsOf(name);

  const logout = async () => {
    await api.post("/api/auth/logout").catch(() => undefined);
    goToLogin("logout");
  };

  const avatar = (size: string) => (
    <Avatar className={cn(size, "rounded-lg")}>
      <AvatarFallback className="rounded-lg font-semibold text-white" style={{ backgroundColor: avatarColor(name) }}>
        {initials}
      </AvatarFallback>
    </Avatar>
  );

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground">
            {avatar("size-8")}
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-semibold">{name}</span>
              <span className="truncate text-xs text-sidebar-foreground/70">{role}</span>
            </div>
          </SidebarMenuButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="min-w-56 rounded-lg" side={isMobile ? "bottom" : state === "collapsed" ? "right" : "top"} align="end" sideOffset={4}>
          <DropdownMenuLabel className="p-0 font-normal">
            <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
              {avatar("size-9")}
              <div className="grid flex-1 leading-tight">
                <span className="truncate font-semibold">{name}</span>
                <span className="truncate text-xs text-muted-foreground">{user.user_code}</span>
              </div>
            </div>
            <div className="mx-1 mb-1 rounded-md bg-muted/60 px-2 py-1.5 text-xs">
              <div className="truncate font-medium">{role}</div>
              <div className="truncate text-muted-foreground">{place}</div>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {user.assignment_count > 1 && (
            <DropdownMenuItem className="py-2" onSelect={() => setSwitching(true)}>
              <IconExchangeFilled className="size-4" />
              {t("switch")}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem asChild className="py-2">
            <Link href="/dashboard/profile" onClick={() => setOpenMobile(false)}>
              <IconUserFilled className="size-4" />
              {t("profile")}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" className="gap-2.5 py-2.5" onSelect={() => void logout()}>
            <IconLogout className="size-[18px]" />
            {t("logout")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {user.assignment_count > 1 && <SwitchAssignmentDialog open={switching} onOpenChange={setSwitching} />}
    </>
  );
}
