"use client";

import { usePathname } from "next/navigation";
import { navConfig } from "@/lib/config";
import { ModeToggle } from "@/components/theme/mode-toggle";
import { SidebarMobile } from "../../layout-components";
import { useAuth } from "@/contexts/auth-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Keyboard } from "lucide-react";

const ROLE_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  admin: "default",
  operator: "secondary",
  recipient: "outline",
};

const Header = () => {
  const pathName = usePathname();
  const { user, logout } = useAuth();
  const pageTitle = navConfig.navLinks.find((elem) => {
    if (elem.href === pathName) {
      return elem.pageTitle;
    }
  });

  return (
    <div className="flex h-full w-full flex-row items-center justify-between text-foreground">
      <div className="block w-full font-medium sm:block">
        {pageTitle?.pageTitle}
      </div>
      <div className="flex h-full w-full items-center justify-end gap-3">
        {user && (
          <div className="hidden items-center gap-2 sm:flex">
            <span className="text-sm text-muted-foreground truncate max-w-[140px]">
              {user.name}
            </span>
            <Badge variant={ROLE_VARIANT[user.role] ?? "secondary"}>
              {user.role}
            </Badge>
            <Button variant="ghost" size="sm" onClick={logout}>
              Sign out
            </Button>
          </div>
        )}
        {/* Keyboard shortcuts hint */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="hidden sm:flex h-8 w-8 text-muted-foreground" aria-label="Keyboard shortcuts">
                <Keyboard className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs p-3">
              <p className="font-semibold text-xs mb-2">Keyboard Shortcuts</p>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between gap-4"><span className="text-muted-foreground">Emergency Stop</span><kbd className="rounded bg-muted px-1 font-mono">Space (hold)</kbd></div>
                <div className="flex justify-between gap-4"><span className="text-muted-foreground">Toggle sidebar</span><kbd className="rounded bg-muted px-1 font-mono">Ctrl+B</kbd></div>
                <div className="flex justify-between gap-4"><span className="text-muted-foreground">Dashboard</span><kbd className="rounded bg-muted px-1 font-mono">G D</kbd></div>
                <div className="flex justify-between gap-4"><span className="text-muted-foreground">Deliveries</span><kbd className="rounded bg-muted px-1 font-mono">G L</kbd></div>
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <div className="block sm:hidden">
          <SidebarMobile />
        </div>
        <div className="hidden sm:block">
          <ModeToggle />
        </div>
      </div>
    </div>
  );
};

export default Header;
