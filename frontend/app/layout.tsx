import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "DWS — Digital Walking Stick | AI-Powered Indoor Navigation",
  description:
    "Voice-first indoor navigation assistant for visually impaired users. Real-time computer vision, AI scene understanding, and intelligent pathfinding.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider
      appearance={{
        variables: {
          colorPrimary: "#bfc8c3",
          colorBackground: "#121a17",
          colorInputBackground: "#1a2420",
          colorInputText: "#f2f4f3",
          colorText: "#f2f4f3",
          colorTextSecondary: "#bfc8c3",
          borderRadius: "0.75rem",
        },
        elements: {
          card: "shadow-xl border border-[rgba(191,200,195,0.1)]",
          formButtonPrimary:
            "bg-gradient-to-r from-[#d5dbd8] to-[#bfc8c3] text-[#0a0e0c] hover:opacity-90",
        },
      }}
    >
      <html lang="en">
        <head>
          <link
            rel="stylesheet"
            href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css"
          />
        </head>
        <body
          className={`${inter.variable} ${jetbrainsMono.variable} antialiased`}
        >
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
