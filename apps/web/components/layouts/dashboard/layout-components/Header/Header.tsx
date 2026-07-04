"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bot, Keyboard, LogOut } from "lucide-react";
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

const ROLE_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  admin: "default",
  operator: "secondary",
  recipient: "outline",
};

function normalizePathname(pathname: string): string {
  if (pathname === "/") return "/";
  return pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

function resolveNavLink(pathname: string) {
  const normalized = normalizePathname(pathname);
  const exact = navConfig.navLinks.find((link) => link.href === normalized);
  if (exact) return exact;

  return navConfig.navLinks
    .filter((link) => link.href !== "/")
    .sort((a, b) => b.href.length - a.href.length)
    .find(
      (link) =>
        normalized === link.href || normalized.startsWith(`${link.href}/`),
    );
}

const Header = () => {
  const pathName = usePathname();
  const { user, logout } = useAuth();
  const navLink = resolveNavLink(pathName);
  const title = navLink?.label ?? "Stair-Doc";

  return (
    <div className="flex h-full w-full min-w-0 items-center gap-2 sm:gap-3">
      {/* Mobile: menu + compact brand */}
      <div className="flex shrink-0 items-center gap-2 sm:hidden">
        <SidebarMobile />
        <Link href="/" className="flex items-center gap-1.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-purple-600">
            <Bot className="h-4 w-4 text-white" />
          </div>
          <span className="hidden bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-sm font-bold text-transparent min-[400px]:inline">
            Stair-Doc
          </span>
        </Link>
      </div>

      {/* Page title — short nav label in bar; full title in page content */}
      <h1
        title={navLink?.pageTitle}
        className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground sm:text-base"
      >
        {title}
      </h1>

      {/* Actions — always visible, never clipped */}
      <div className="flex shrink-0 items-center gap-1 sm:gap-1.5 lg:gap-2">
        {user && (
          <div className="flex items-center gap-1 sm:gap-1.5 lg:gap-2">
            <span className="hidden max-w-[9rem] truncate text-sm text-muted-foreground xl:inline 2xl:max-w-[12rem]">
              {user.name}
            </span>
            <Badge
              variant={ROLE_VARIANT[user.role] ?? "secondary"}
              className="shrink-0 whitespace-nowrap capitalize"
            >
              {user.role}
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              onClick={logout}
              className="h-8 w-8 shrink-0 sm:inline-flex lg:hidden"
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={logout}
              className="hidden shrink-0 px-2 lg:inline-flex"
            >
              Sign out
            </Button>
          </div>
        )}

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="hidden h-8 w-8 text-muted-foreground lg:flex"
                aria-label="Keyboard shortcuts"
              >
                <Keyboard className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={8} className="z-[100] max-w-xs p-3">
              <p className="mb-2 text-xs font-semibold">Keyboard Shortcuts</p>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Emergency Stop</span>
                  <kbd className="rounded bg-muted px-1 font-mono">
                    Space (hold)
                  </kbd>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Toggle sidebar</span>
                  <kbd className="rounded bg-muted px-1 font-mono">Ctrl+B</kbd>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Dashboard</span>
                  <kbd className="rounded bg-muted px-1 font-mono">G D</kbd>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Deliveries</span>
                  <kbd className="rounded bg-muted px-1 font-mono">G L</kbd>
                </div>
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <div className="shrink-0">
          <ModeToggle />
        </div>
      </div>
    </div>
  );
};

export default Header;
