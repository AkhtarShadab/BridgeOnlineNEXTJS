/**
 * Resolve the Socket.io base URL for browser clients.
 * Prefer NEXT_PUBLIC_SOCKET_URL when set; otherwise use the current origin
 * (works on Render where the custom server hosts HTTP + Socket.io together).
 * Falls back to localhost only during local SSR/build without a window.
 */
export function getSocketUrl(): string {
    const fromEnv = process.env.NEXT_PUBLIC_SOCKET_URL?.trim();
    if (fromEnv) return fromEnv;
    if (typeof window !== "undefined" && window.location?.origin) {
        return window.location.origin;
    }
    return "http://localhost:3000";
}
