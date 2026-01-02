import "./globals.css";
import { ReactNode } from "react";

export const metadata = {
  title: "Synlitics — Upload & Track",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen text-slate-100">
        <div className="relative min-h-screen overflow-hidden">
          {/* subtle overlay to dim edges */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/40" />
          {children}
        </div>
      </body>
    </html>
  );
}
