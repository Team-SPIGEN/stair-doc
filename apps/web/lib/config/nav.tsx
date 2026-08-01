import { Icons } from "@/components/icons";
import type { UserRole } from "@/types/auth";

export type NavLink = {
  icon: React.ReactNode;
  iconMobile: React.ReactNode;
  label: string;
  href: string;
  pageTitle: string;
  navLocation: "top" | "bottom";
  /** Roles that can see this link.  Omit or empty → visible to everyone. */
  roles?: UserRole[];
};

export type NavConfig = {
  navLinks: NavLink[];
};

export const navConfig: NavConfig = {
  navLinks: [
    {
      icon: <Icons.home className="h-5 w-5" />,
      iconMobile: <Icons.home className="h-5 w-5" />,
      label: "Overview",
      href: "/",
      pageTitle: "Stair-Doc Dashboard",
      navLocation: "top",
      // All roles can see Overview
    },
    {
      icon: <Icons.performance className="h-5 w-5" />,
      iconMobile: <Icons.performance className="h-5 w-5" />,
      label: "Robot Status",
      href: "/dashboard",
      pageTitle: "Robot Status Dashboard",
      navLocation: "top",
      roles: ["operator", "admin"],
    },
    {
      icon: <Icons.rules className="h-5 w-5" />,
      iconMobile: <Icons.rules className="h-5 w-5" />,
      label: "Deliveries",
      href: "/deliveries",
      pageTitle: "Delivery Queue",
      navLocation: "top",
      // All roles can see Deliveries
    },
    {
      icon: <Icons.creditCard className="h-5 w-5" />,
      iconMobile: <Icons.creditCard className="h-5 w-5" />,
      label: "RFID",
      href: "/rfid",
      pageTitle: "RFID Control",
      navLocation: "top",
      // All roles can see RFID
    },
    {
      icon: <Icons.camera className="h-5 w-5" />,
      iconMobile: <Icons.camera className="h-5 w-5" />,
      label: "Camera",
      href: "/camera",
      pageTitle: "Live Robot Camera",
      navLocation: "top",
      // All roles can see Camera
    },
    {
      icon: <Icons.image className="h-5 w-5" />,
      iconMobile: <Icons.image className="h-5 w-5" />,
      label: "Gallery",
      href: "/camera/gallery",
      pageTitle: "Photo Gallery",
      navLocation: "top",
      roles: ["operator", "admin"],
    },
    {
      icon: <Icons.analytics className="h-5 w-5" />,
      iconMobile: <Icons.analytics className="h-5 w-5" />,
      label: "Analytics",
      href: "/analytics",
      pageTitle: "Robot Performance Analytics",
      navLocation: "top",
      roles: ["admin"],
    },
    {
      icon: <Icons.gamepad className="h-5 w-5" />,
      iconMobile: <Icons.gamepad className="h-5 w-5" />,
      label: "Navigation",
      href: "/navigation",
      pageTitle: "Navigation",
      navLocation: "top",
      // Visible for demo/manual control access. Sub-routes: /manual, /autonomous.
    },
    {
      icon: <Icons.settings className="h-5 w-5" />,
      iconMobile: <Icons.settings className="h-5 w-5" />,
      label: "Settings",
      href: "/settings",
      pageTitle: "Settings",
      navLocation: "bottom",
      roles: ["operator", "admin"],
    },
  ],
};
