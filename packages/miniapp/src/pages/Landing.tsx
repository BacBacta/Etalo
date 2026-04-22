import { Button } from "@/components/ui/button";

export default function Landing() {
  return (
    <main className="flex min-h-full flex-col items-center justify-center px-6 pt-safe pb-safe">
      <div className="flex flex-col items-center gap-6 text-center">
        <h1 className="text-4xl font-semibold tracking-tight">Etalo</h1>
        <p className="max-w-xs text-base text-muted-foreground">
          Your digital stall, open 24/7.
        </p>
        <Button className="mt-4 w-full max-w-xs">Get started</Button>
      </div>
    </main>
  );
}
