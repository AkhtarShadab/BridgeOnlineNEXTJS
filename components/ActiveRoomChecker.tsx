"use client";

import { useActiveRoomRedirect } from "@/lib/hooks/useActiveRoomRedirect";
import { useEffect } from "react";

/**
 * Client component wrapper that handles active room redirect
 */
export function ActiveRoomChecker({ children }: { children: React.ReactNode }) {
    // Redirect to active room if user has one
    useActiveRoomRedirect();

    return <>{children}</>;
}
