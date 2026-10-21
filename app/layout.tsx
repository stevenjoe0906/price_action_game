import type { Metadata, Viewport } from "next";
import "./globals.css";
export const metadata: Metadata = {
  applicationName: "Price Action",
  title: "Price Action — Trading Practice",
  description:
    "Train your eye. Practice price action with blind historical replay, risk-based orders, and twenty turns per game.",
  appleWebApp: {
    capable: true,
    title: "Price Action",
    statusBarStyle: "default",
  },
  icons: {
    icon: "/icons/icon.svg",
    apple: "/icons/apple-touch-icon.png",
  },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#101619",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
