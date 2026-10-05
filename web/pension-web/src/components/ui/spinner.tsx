import { IconRefresh as Loader } from "@tabler/icons-react";

import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  const t = useTranslations("common");
  return (
    <Loader
      role="status"
      aria-label={t("loading")}
      className={cn("size-4 animate-spin", className)}
      {...props}
    />
  );
}

export { Spinner };
