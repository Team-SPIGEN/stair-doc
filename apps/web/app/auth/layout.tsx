import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In | Stair-Doc",
  description: "Sign in to the Stair-Doc robot delivery control panel",
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
