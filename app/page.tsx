import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { DotPattern } from "@/components/ui/dot-pattern";
import { BlurFade } from "@/components/ui/blur-fade";
import { AnimatedGradientText } from "@/components/ui/animated-gradient-text";
import { ShimmerButton } from "@/components/ui/shimmer-button";

export default async function Home() {
    // Redirect logged-in users to dashboard
    const session = await auth();
    if (session?.user) {
        redirect("/dashboard");
    }

    return (
        <div className="relative min-h-screen flex flex-col items-center justify-center bg-background px-6 overflow-hidden">
            <DotPattern className="text-[var(--border)] [mask-image:radial-gradient(ellipse_at_center,white,transparent_75%)]" />
            <div className="relative z-10 text-center space-y-8 p-8 max-w-2xl">
                <BlurFade delay={0}>
                    <p className="halo-eyebrow">
                        <AnimatedGradientText colorFrom="var(--accent)" colorTo="var(--accent-muted)">
                            Real-time multiplayer bridge
                        </AnimatedGradientText>
                    </p>
                </BlurFade>
                <BlurFade delay={0.1}>
                    <h1 className="text-6xl font-bold text-foreground tracking-tight">
                        ♠ ♥ BridgeOnline ♦ ♣
                    </h1>
                </BlurFade>
                <BlurFade delay={0.2}>
                    <p className="text-xl text-text-muted">
                        A calm, focused table for ACBL-rules contract bridge with friends.
                    </p>
                </BlurFade>
                <BlurFade delay={0.3}>
                    <div className="flex items-center justify-center gap-4 pt-4">
                        <ShimmerButton
                            href="/login"
                            borderRadius="10px"
                            background="var(--accent)"
                            className="h-10 px-6 py-0 font-semibold leading-10"
                        >
                            Log In
                        </ShimmerButton>
                        <a
                            href="/register"
                            className="inline-block px-6 h-10 leading-10 bg-surface text-foreground font-semibold rounded-[10px] border border-[var(--border-strong)] hover:bg-surface-elevated transition-colors"
                        >
                            Register
                        </a>
                    </div>
                </BlurFade>
                <BlurFade delay={0.4}>
                    <div className="pt-12 flex flex-wrap items-center justify-center gap-3 text-sm text-text-muted">
                        <span className="halo-chip">✓ ACBL rules</span>
                        <span className="halo-chip">✓ Real-time</span>
                        <span className="halo-chip">✓ Private rooms</span>
                    </div>
                </BlurFade>
            </div>
        </div>
    );
}
