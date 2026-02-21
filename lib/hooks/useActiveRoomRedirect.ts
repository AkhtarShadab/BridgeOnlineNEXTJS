import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';

/**
 * Hook to redirect users to their active game room if they try to navigate elsewhere
 */
export function useActiveRoomRedirect() {
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        // Don't check if already on a room page
        if (pathname?.startsWith('/room/')) return;

        const checkActiveRoom = async () => {
            try {
                const response = await fetch('/api/active-room');
                const data = await response.json();

                if (data.activeRoom) {
                    console.log('Active room found, redirecting to:', data.activeRoom);
                    router.push(`/room/${data.activeRoom}`);
                }
            } catch (error) {
                console.error('Error checking active room:', error);
            }
        };

        checkActiveRoom();
    }, [pathname, router]);
}
