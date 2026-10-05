"use client";

import type { ReactNode } from "react";

import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { NavAccessGuard } from "@/components/dashboard/nav-access-guard";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import type { Me } from "@/lib/api-types";
import { BreadcrumbProvider } from "@/providers/breadcrumb-provider";
import { SessionProvider } from "@/providers/session-provider";

/** The signed-in frame, as Chikitsa-Raj's dashboard layout: inset sidebar, sticky header, one scrolling pane. */
export function DashboardShell({ user, children }: { user: Me; children: ReactNode }) {
  // A new assignment remounts every screen, so each one refetches for the new session.
  const session = `${user.id}:${user.role?.id ?? ""}:${user.district?.id ?? ""}:${user.center?.id ?? ""}`;
  return (
    <SessionProvider user={user}>
      <SidebarProvider key={session} className="h-svh overflow-hidden">
        <AppSidebar />
        <SidebarInset className="flex h-full min-h-0 flex-col overflow-hidden">
          <BreadcrumbProvider>
            <DashboardHeader />
            {/* h-svh + overflow-hidden on the provider pins the shell to the viewport, so the header
                stays put and ONLY this scroller moves (as in Chikitsa-Raj). */}
            <div className="min-h-0 flex-1 overflow-y-auto p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:p-4 md:pb-[max(1rem,env(safe-area-inset-bottom))]">
              <main className="h-full min-h-0">
                <NavAccessGuard>{children}</NavAccessGuard>
              </main>
            </div>
          </BreadcrumbProvider>
        </SidebarInset>
      </SidebarProvider>
    </SessionProvider>
  );
}
