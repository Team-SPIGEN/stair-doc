import { Icons } from "@/components/icons";

export type NavConfig = typeof navConfig;

export const navConfig = {
  navLinks: [
    {
      icon: <Icons.home className="h-5 w-5" />,
      iconMobile: <Icons.home className="h-5 w-5" />,
      label: "Overview",
      href: "/",
      pageTitle: "Stair-Doc Dashboard",
      navLocation: "top",
    },
    {
      icon: <Icons.performance className="h-5 w-5" />,
      iconMobile: <Icons.performance className="h-5 w-5" />,
      label: "Robot Status",
      href: "/dashboard",
      pageTitle: "Robot Status Dashboard",
      navLocation: "top",
    },
    {
      icon: <Icons.rules className="h-5 w-5" />,
      iconMobile: <Icons.rules className="h-5 w-5" />,
      label: "Deliveries",
      href: "/deliveries",
      pageTitle: "Delivery Queue",
      navLocation: "top",
    },
    {
      icon: <Icons.creditCard className="h-5 w-5" />,
      iconMobile: <Icons.creditCard className="h-5 w-5" />,
      label: "RFID",
      href: "/rfid",
      pageTitle: "RFID Control",
      navLocation: "top",
    },
    {
      icon: <Icons.camera className="h-5 w-5" />,
      iconMobile: <Icons.camera className="h-5 w-5" />,
      label: "Camera",
      href: "/camera",
      pageTitle: "Live Robot Camera",
      navLocation: "top",
    },
    {
      icon: <Icons.image className="h-5 w-5" />,
      iconMobile: <Icons.image className="h-5 w-5" />,
      label: "Gallery",
      href: "/camera/gallery",
      pageTitle: "Photo Gallery",
      navLocation: "top",
    },
    {
      icon: <Icons.gamepad className="h-5 w-5" />,
      iconMobile: <Icons.gamepad className="h-5 w-5" />,
      label: "Navigation",
      href: "/navigation",
      pageTitle: "Navigation Controls",
      navLocation: "top",
    },
    {
      icon: <Icons.file className="h-5 w-5" />,
      iconMobile: <Icons.file className="h-5 w-5" />,
      label: "Docs",
      href: "https://next-fast-turbo.mintlify.app/",
      pageTitle: "Documentation",
      navLocation: "bottom",
    },
  ],
};
