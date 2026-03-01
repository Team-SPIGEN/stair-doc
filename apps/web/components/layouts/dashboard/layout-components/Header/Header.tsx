"use client";

import { usePathname } from "next/navigation";
import { navConfig } from "@/lib/config";
import { ModeToggle } from "@/components/theme/mode-toggle";
import { SidebarMobile } from "../../layout-components";
import { useAuth } from "@/contexts/auth-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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
