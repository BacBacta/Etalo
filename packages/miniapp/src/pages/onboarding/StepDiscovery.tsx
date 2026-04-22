import { useState } from "react";
import { Clock, ShieldCheck, Star } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SLIDES = [
  {
    icon: Clock,
    title: "Open 24/7",
    body: "Your stall stays open while you sleep. Buyers can place orders any time, from any country.",
  },
  {
    icon: ShieldCheck,
    title: "Payment you can trust",
    body: "Payments are held in escrow until the buyer confirms delivery. No chargebacks, no runaway buyers.",
  },
  {
    icon: Star,
    title: "Build your reputation",
    body: "Every fulfilled order builds your score. Top sellers release funds faster and stand out to buyers.",
  },
];

export function StepDiscovery({ onNext }: { onNext: () => void }) {
  const [index, setIndex] = useState(0);
  const last = index === SLIDES.length - 1;
  const slide = SLIDES[index];
  const Icon = slide.icon;

  const next = () => {
    if (last) onNext();
    else setIndex(index + 1);
  };

  return (
    <div className="flex h-full flex-col items-center justify-center gap-8 py-8 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
        <Icon className="h-10 w-10 text-primary" />
      </div>
      <div className="flex flex-col gap-3">
        <h2 className="text-2xl font-semibold">{slide.title}</h2>
        <p className="max-w-xs text-base text-muted-foreground">{slide.body}</p>
      </div>
      <div className="flex gap-2">
        {SLIDES.map((_, i) => (
          <span
            key={i}
            className={cn(
              "h-2 w-2 rounded-full",
              i === index ? "bg-primary" : "bg-muted",
            )}
          />
        ))}
      </div>
      <Button className="w-full" size="lg" onClick={next}>
        {last ? "Create my shop" : "Next"}
      </Button>
    </div>
  );
}
