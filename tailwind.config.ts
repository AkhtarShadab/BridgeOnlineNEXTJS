import type { Config } from "tailwindcss";

export default {
    content: [
        "./pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./components/**/*.{js,ts,jsx,tsx,mdx}",
        "./app/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                background: 'var(--background)',
                foreground: 'var(--foreground)',
                surface: 'var(--surface)',
                'surface-elevated': 'var(--surface-elevated)',
                border: 'var(--border)',
                accent: 'var(--accent)',
                'accent-muted': 'var(--accent-muted)',
                felt: 'var(--felt)',
                text: 'var(--text)',
                'text-muted': 'var(--text-muted)',
                'suit-red': 'var(--suit-red)',
                'suit-black': 'var(--suit-black)',
                'team-ns': 'var(--team-ns)',
                'team-ew': 'var(--team-ew)',
            },
            animation: {
                'card-deal': 'cardDeal 0.5s ease-out',
                'card-play': 'cardPlay 0.3s ease-in-out',
                'trick-collect': 'trickCollect 0.5s ease-in',
                // Magic UI — shimmer-button + animated-gradient-text
                'shimmer-slide': 'shimmer-slide var(--speed) ease-in-out infinite alternate',
                'spin-around': 'spin-around calc(var(--speed) * 2) infinite linear',
                gradient: 'gradient 8s linear infinite',
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
                // Magic UI — shimmer-button
                'shimmer-slide': {
                    to: { transform: 'translate(calc(100cqw - 100%), 0)' },
                },
                'spin-around': {
                    '0%': { transform: 'translateZ(0) rotate(0)' },
                    '15%, 35%': { transform: 'translateZ(0) rotate(90deg)' },
                    '65%, 85%': { transform: 'translateZ(0) rotate(270deg)' },
                    '100%': { transform: 'translateZ(0) rotate(360deg)' },
                },
                // Magic UI — animated-gradient-text
                gradient: {
                    to: { backgroundPosition: 'var(--bg-size, 300%) 0' },
                },
            },
        },
    },
    plugins: [],
} satisfies Config;
