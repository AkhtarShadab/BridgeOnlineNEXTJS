import type { Metadata } from "next";
import { Inter, Playfair_Display, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import "@/components/game/playing-table.css";
import { Providers } from "./providers";
import { ThemeToggle } from "@/components/ui/theme-toggle";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const playfair = Playfair_Display({ subsets: ["latin"], variable: "--font-brand" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

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
        <html lang="en" suppressHydrationWarning className={`${inter.variable} ${playfair.variable} ${jetbrainsMono.variable}`}>
            <head>
                {/* No-flash theme script: applies .dark before first paint.
                    Dark is the default — only an explicit "light" opts out. */}
                <script
                    dangerouslySetInnerHTML={{
                        __html: `try{var t=localStorage.getItem("theme");if(t!=="light")document.documentElement.classList.add("dark")}catch(e){document.documentElement.classList.add("dark")}`,
                    }}
                />
            </head>
            <body className="halo antialiased" style={{ fontFamily: "var(--font-sans)" }}>
                <Providers>{children}</Providers>
                <ThemeToggle />
            </body>
        </html>
    );
}
