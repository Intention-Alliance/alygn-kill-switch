import { Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { BRAND_FOOTER_CREDIT, BRAND_VERSION } from "@/lib/branding";

interface SidebarFooterProps {
  collapsed?: boolean;
}

/**
 * Brand credit + version footer for the sidebar. Renders the configurable
 * footer credit line (NEXT_PUBLIC_BRAND_FOOTER_CREDIT) plus the app version.
 * In collapsed mode only a compact mark is shown.
 */
export function SidebarFooter({ collapsed = false }: SidebarFooterProps) {
  if (collapsed) {
    return (
      <div className="flex justify-center px-2 py-2">
        <Shield className="h-4 w-4 text-muted-foreground/50" />
      </div>
    );
  }

  return (
    <div className={cn("px-4 py-3")}>
      <p className="text-[10px] leading-snug text-muted-foreground/80">
        {BRAND_FOOTER_CREDIT}
      </p>
      <p className="mt-0.5 text-[10px] text-muted-foreground/50">
        {BRAND_VERSION}
      </p>
    </div>
  );
}
