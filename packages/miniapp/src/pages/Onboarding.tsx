import { Button } from "@/components/ui/button";
import { MobileLayout } from "@/components/layouts/MobileLayout";

/**
 * Stub for the 3-step seller onboarding. Full flow lands in Block 4.
 */
export default function Onboarding() {
  return (
    <MobileLayout
      bottomCta={
        <Button className="w-full" size="lg" disabled>
          Start in Block 4
        </Button>
      }
    >
      <section className="flex flex-col gap-4 pt-8 text-center">
        <h1 className="text-2xl font-semibold">Create your shop</h1>
        <p className="text-base text-muted-foreground">
          Tell buyers who you are in 3 steps. This flow comes to life at
          Block 4.
        </p>
      </section>
    </MobileLayout>
  );
}
