import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
    const session = await auth();
    const { pathname } = request.nextUrl;

    // Public routes that don't require authentication
    const publicRoutes = ["/login", "/register", "/api/auth/register"];

    // Routes that should redirect to dashboard if user is logged in
    const authRoutes = ["/", "/login", "/register"];

    const isPublicRoute = publicRoutes.some(route => pathname.startsWith(route));
    const isAuthRoute = authRoutes.includes(pathname);

    // If user is logged in and trying to access landing/login/register, redirect to dashboard
    if (session?.user && isAuthRoute) {
        return NextResponse.redirect(new URL("/dashboard", request.url));
    }

    // If user is not logged in and trying to access protected routes, redirect to login
    if (!session?.user && !isPublicRoute && pathname !== "/" && !pathname.startsWith("/api")) {
        return NextResponse.redirect(new URL("/login", request.url));
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         */
        "/((?!_next/static|_next/image|favicon.ico).*)",
    ],
};
