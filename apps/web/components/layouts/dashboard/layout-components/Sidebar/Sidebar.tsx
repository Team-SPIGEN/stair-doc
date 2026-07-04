"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Icons } from "@/components/icons";
import { motion } from "framer-motion";
import { Bot } from "lucide-react";
import NavLinks from "./NavLinks";
import {
  isSidebarCollapsed,
  setSidebarCollapsed,
  subscribeSidebarToggle,
} from "@/lib/sidebar-toggle";

const Sidebar = () => {
  const [collapsed, setCollapsed] = useState(isSidebarCollapsed);
  const animationDuration = 0.4;
  const sideBarWidth = "250px";

  useEffect(() => {
    return subscribeSidebarToggle(setCollapsed);
  }, []);

  const handleClose = () => {
    setSidebarCollapsed(!collapsed);
  };

  return (
    <motion.div
      layout
      initial={{ width: collapsed ? "88px" : sideBarWidth }}
      animate={{
        minWidth: collapsed ? "88px" : sideBarWidth,
        width: collapsed ? "88px" : sideBarWidth,
      }}
      transition={{ duration: animationDuration }}
      id="sidebar"
      className={`flex h-full flex-col justify-between gap-8 border-r border-border`}
    >
      <div
        className={`flex h-20 items-center justify-between border-b border-border ${
          collapsed ? "px-8" : "px-4"
        } `}
      >
        <Link href="/">
          <motion.div
            layout
            animate={{
              x: collapsed ? -100 : 0,
              y: collapsed ? 0 : 0,
              opacity: collapsed ? 0 : 1,
              width: collapsed ? 0 : "auto",
              display: collapsed ? "none" : "block",
            }}
            transition={{ duration: animationDuration }}
          >
            <div className="flex flex-row items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-purple-600">
                <Bot className="h-4 w-4 text-white" />
              </div>
              <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-sm font-bold text-transparent">
                Stair-Doc
              </span>
            </div>
          </motion.div>
        </Link>

        {collapsed ? (
          <Icons.panelLeftOpen
            className="h-6 w-6 cursor-pointer text-muted-foreground transition-all hover:text-foreground hover:duration-300"
            onClick={handleClose}
          />
        ) : (
          <Icons.panelLeftClose
            className="h-6 w-6 cursor-pointer text-muted-foreground transition-all hover:text-foreground hover:duration-300"
            onClick={handleClose}
          />
        )}
      </div>
      <div className="flex-1 border-border pb-8">
        <NavLinks collapsed={collapsed} animationDuration={animationDuration} />
      </div>
    </motion.div>
  );
};

export default Sidebar;
