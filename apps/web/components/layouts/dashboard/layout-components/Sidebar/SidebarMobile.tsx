"use client";

import { useRef, useState } from "react";
import { Squash as Hamburger } from "hamburger-react";
import { useClickAway } from "react-use";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { Bot } from "lucide-react";
import { navConfig } from "@/lib/config/";
import { useAuth } from "@/contexts/auth-context";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ModeToggle } from "@/components/theme/mode-toggle";

const ROLE_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  admin: "default",
  operator: "secondary",
  recipient: "outline",
};

const SidebarMobile = () => {
  const [isOpen, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { user, role, logout } = useAuth();

  useClickAway(ref, () => setOpen(false));

  const visibleLinks = navConfig.navLinks.filter((link) => {
    if (!link.roles || link.roles.length === 0) return true;
    if (!role) return false;
    return link.roles.includes(role);
  });

  const close = () => setOpen(false);

  return (
    <div ref={ref} className="relative z-[60]">
      <Hamburger
        toggled={isOpen}
        size={20}
        toggle={setOpen}
        aria-label="Open navigation menu"
      />
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.button
              type="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-[55] bg-black/50 sm:hidden"
              aria-label="Close navigation menu"
              onClick={close}
            />
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 320, damping: 32 }}
              className="fixed inset-y-0 left-0 z-[60] flex w-[min(85vw,20rem)] flex-col border-r border-border bg-background shadow-xl"
            >
              <div className="flex h-16 items-center gap-2 border-b border-border px-4">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-purple-600">
                  <Bot className="h-4 w-4 text-white" />
                </div>
                <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-sm font-bold text-transparent">
                  Stair-Doc
                </span>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-4">
                {user && (
                  <div className="mb-4 rounded-lg border bg-muted/30 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {user.name}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {user.email}
                        </p>
                      </div>
                      <Badge
                        variant={ROLE_VARIANT[user.role] ?? "secondary"}
                        className="shrink-0 capitalize"
                      >
                        {user.role}
                      </Badge>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-3 w-full"
                      onClick={() => {
                        close();
                        logout();
                      }}
                    >
                      Sign out
                    </Button>
                  </div>
                )}

                <nav>
                  <ul className="space-y-1">
                    {visibleLinks.map((link) => (
                      <li key={link.href}>
                        <Link
                          href={link.href}
                          onClick={close}
                          className="block rounded-md px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                        >
                          {link.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </nav>
              </div>

              <div className="flex items-center justify-between border-t border-border px-4 py-3">
                <span className="text-xs text-muted-foreground">Theme</span>
                <ModeToggle />
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SidebarMobile;
