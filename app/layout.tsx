import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Price Action — Trading Practice",
  description:
    "Train your eye. Practice price action with blind historical replay, risk-based orders, and twenty turns per game.",
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
