import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';

/**
 * Redirects users to their active game or room so they can never get "stranded"
 * on the dashboard while a session is in progress.
 *
 * Priority:
 *  1. If the user has an active IN_PROGRESS game  → /game/[gameId]
 *  2. If the user is in a room (WAITING / READY)   → /room/[roomId]
 *  3. Otherwise do nothing
 */
export function useActiveRoomRedirect() {
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        // Already on the right page — do nothing
        if (pathname?.startsWith('/room/')) return;
        if (pathname?.startsWith('/game/')) return;

        const checkActiveRoom = async () => {
            try {
                const response = await fetch('/api/active-room');
                const data = await response.json();

                if (data.activeGame) {
                    // Game is in progress — go straight to the game board
                    console.log('[ActiveRoomRedirect] Active game found, redirecting to:', data.activeGame);
                    router.push(`/game/${data.activeGame}`);
                } else if (data.activeRoom) {
                    // In a room but no active game yet — go to the lobby
                    console.log('[ActiveRoomRedirect] Active room found, redirecting to:', data.activeRoom);
                    router.push(`/room/${data.activeRoom}`);
                }
            } catch (error) {
                console.error('Error checking active room:', error);
            }
        };

        checkActiveRoom();
    }, [pathname, router]);
}
