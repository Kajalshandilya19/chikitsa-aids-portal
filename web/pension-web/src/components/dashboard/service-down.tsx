import { IconCloudOff } from "@tabler/icons-react";

/** Shown instead of the dashboard when auth-service cannot be reached. */
export function ServiceDown({ title, text, retry }: { title: string; text: string; retry: string }) {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-3 p-6 text-center">
      <span className="grid size-14 place-items-center rounded-full bg-muted">
        <IconCloudOff className="size-7 text-muted-foreground" aria-hidden />
      </span>
      <h1 className="text-lg font-semibold">{title}</h1>
      <p className="max-w-sm text-sm text-muted-foreground">{text}</p>
      <a href="/dashboard" className="text-sm font-medium text-primary hover:underline">
        {retry}
      </a>
    </main>
  );
}
