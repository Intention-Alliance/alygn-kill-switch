import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dignity Verifier — Training Framework",
  description:
    "Super-admin dashboard for the Dignity Verifier Training Framework. " +
    "Distills inference-safety classification into a 0.5B student model via LoRA fine-tuning.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">{children}</body>
    </html>
  );
}
