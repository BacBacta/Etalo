import { cn } from "@/lib/utils";

interface StepIndicatorProps {
  current: 1 | 2 | 3;
  total?: number;
  className?: string;
}

export function StepIndicator({
  current,
  total = 3,
  className,
}: StepIndicatorProps) {
  return (
    <div
      className={cn("flex items-center justify-center gap-2", className)}
      aria-label={`Step ${current} of ${total}`}
    >
      {Array.from({ length: total }, (_, i) => {
        const idx = i + 1;
        const active = idx <= current;
        return (
          <span
            key={idx}
            className={cn(
              "h-2 rounded-full transition-all",
              active ? "w-8 bg-primary" : "w-2 bg-muted",
            )}
          />
        );
      })}
    </div>
  );
}
