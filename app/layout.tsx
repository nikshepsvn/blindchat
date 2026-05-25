import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BlindChat — private chat with portable memory",
  description:
    "Private inference via Venice. Encrypted memory via BlindCache. Your keys, your data, your network.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
