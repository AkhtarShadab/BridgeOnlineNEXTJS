import type { Config } from "tailwindcss";

export default {
    content: [
        "./pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./components/**/*.{js,ts,jsx,tsx,mdx}",
        "./app/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            colors: {
                background: "var(--background)",
                foreground: "var(--foreground)",
                // Bridge card suits
                'suit-red': '#DC2626',
                'suit-black': '#1F2937',
                // Card table green
                'table-green': '#047857',
                'table-green-dark': '#065F46',
                // Teams
                'team-ns': '#3B82F6',
                'team-ew': '#EF4444',
            },
            animation: {
                'card-deal': 'cardDeal 0.5s ease-out',
                'card-play': 'cardPlay 0.3s ease-in-out',
                'trick-collect': 'trickCollect 0.5s ease-in',
            },
            keyframes: {
                cardDeal: {
                    '0%': { transform: 'translateY(-100px) scale(0.8)', opacity: '0' },
                    '100%': { transform: 'translateY(0) scale(1)', opacity: '1' },
                },
                cardPlay: {
                    '0%': { transform: 'translateY(0) scale(1)' },
                    '100%': { transform: 'translateY(-50px) scale(1.1)' },
                },
                trickCollect: {
                    '0%': { transform: 'scale(1)', opacity: '1' },
                    '100%': { transform: 'scale(0.5)', opacity: '0' },
                },
            },
        },
    },
    plugins: [],
} satisfies Config;
