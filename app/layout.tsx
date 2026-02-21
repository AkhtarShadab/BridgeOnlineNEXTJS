import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

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
        <html lang="en">
            <body className="antialiased">
                <Providers>{children}</Providers>
            </body>
        </html>
    );
}
