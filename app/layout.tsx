import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const playfair = Playfair_Display({ subsets: ["latin"], variable: "--font-brand" });

export const metadata: Metadata = {
    title: "BridgeOnline - Play Bridge Card Game Online",
    description: "Real-time multiplayer Bridge card game following ACBL rules",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en" className={`dark ${inter.variable} ${playfair.variable}`}>
            <body className="antialiased" style={{ fontFamily: "var(--font-sans)" }}>
                <Providers>{children}</Providers>
            </body>
        </html>
    );
}
