import type { ReactNode } from "react";

export const metadata = { title: "Tempo markets", description: "Prediction markets and stocks on Tempo." };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
