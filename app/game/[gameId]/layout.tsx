/**
 * The in-game table keeps its original navy/felt theme. The app-wide <body>
 * opts into the Halo design system for outside-the-table navigation, so this
 * layout wraps the game route in `.table-theme`, which re-declares the navy
 * design tokens for its subtree. Result: the table UI is visually unchanged.
 */
export default function GameLayout({ children }: { children: React.ReactNode }) {
    return <div className="table-theme">{children}</div>;
}
