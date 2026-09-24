/* fonts.ts — app web fonts via next/font (self-hosted at build time, no runtime
   request to Google). Each font exposes a CSS variable that app/globals.css
   wires into the design-system font tokens (--font-sans / --font-mono). */
import { Inter, JetBrains_Mono } from "next/font/google";

export const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });

export const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jetbrains-mono",
});

/** Class names to put on <html> so the variables exist app-wide. */
export const fontVariables = `${inter.variable} ${jetbrainsMono.variable}`;
