import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Siniloan Enterprise Data Management",
  description: "Secure municipal data governance and operations",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
