/**
 * ProductImageGallery — swipe gallery for the product detail page.
 *
 * Pure CSS scroll-snap (no carousel dep) + dot indicators + prev/next
 * buttons that update the dot state on scroll. Falls back to a single
 * static image when only one is provided so we don't ship the controls
 * for nothing. Dark-mode bg matches the marketplace card placeholder.
 */
"use client";

import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

interface Props {
  images: string[];
  alt: string;
}

export function ProductImageGallery({ images, alt }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const scrollToIndex = useCallback((index: number) => {
    const track = trackRef.current;
    if (!track) return;
    const slide = track.children[index] as HTMLElement | undefined;
    if (!slide) return;
    track.scrollTo({ left: slide.offsetLeft, behavior: "smooth" });
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const onScroll = () => {
      const slideWidth = track.clientWidth;
      if (slideWidth === 0) return;
      const next = Math.round(track.scrollLeft / slideWidth);
      setActiveIndex((prev) => (prev === next ? prev : next));
    };
    track.addEventListener("scroll", onScroll, { passive: true });
    return () => track.removeEventListener("scroll", onScroll);
  }, []);

  if (images.length === 0) {
    return (
      <div className="aspect-square rounded-lg bg-neutral-100 dark:bg-neutral-800" />
    );
  }

  if (images.length === 1) {
    return (
      <div className="overflow-hidden rounded-lg bg-neutral-100 dark:bg-neutral-800">
        <Image
          src={images[0]}
          alt={alt}
          width={800}
          height={800}
          sizes="(max-width: 640px) 100vw, 800px"
          className="w-full object-cover"
        />
      </div>
    );
  }

  const canPrev = activeIndex > 0;
  const canNext = activeIndex < images.length - 1;

  return (
    <div className="relative">
      <div
        ref={trackRef}
        className="flex aspect-square snap-x snap-mandatory overflow-x-auto overflow-y-hidden rounded-lg bg-neutral-100 dark:bg-neutral-800 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-roledescription="carousel"
        aria-label={`${alt} — ${images.length} photos`}
      >
        {images.map((src, idx) => (
          <div
            key={src}
            className="relative aspect-square w-full shrink-0 snap-center"
            aria-roledescription="slide"
            aria-label={`${idx + 1} of ${images.length}`}
          >
            <Image
              src={src}
              alt={`${alt} — photo ${idx + 1}`}
              fill
              sizes="(max-width: 640px) 100vw, 800px"
              className="object-cover"
              priority={idx === 0}
            />
          </div>
        ))}
      </div>

      {/* Prev / next buttons — hidden on touch via group-hover but
          always reachable via keyboard. 44×44 touch target. */}
      <button
        type="button"
        onClick={() => scrollToIndex(activeIndex - 1)}
        disabled={!canPrev}
        aria-label="Previous photo"
        className="absolute left-2 top-1/2 -translate-y-1/2 inline-flex h-11 w-11 items-center justify-center rounded-full bg-celo-light/80 text-celo-dark shadow-sm backdrop-blur transition-opacity hover:bg-celo-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-celo-forest disabled:pointer-events-none disabled:opacity-0 dark:bg-celo-dark-bg/80 dark:text-celo-light dark:hover:bg-celo-dark-bg"
      >
        <CaretLeft className="h-5 w-5" weight="bold" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => scrollToIndex(activeIndex + 1)}
        disabled={!canNext}
        aria-label="Next photo"
        className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-11 w-11 items-center justify-center rounded-full bg-celo-light/80 text-celo-dark shadow-sm backdrop-blur transition-opacity hover:bg-celo-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-celo-forest disabled:pointer-events-none disabled:opacity-0 dark:bg-celo-dark-bg/80 dark:text-celo-light dark:hover:bg-celo-dark-bg"
      >
        <CaretRight className="h-5 w-5" weight="bold" aria-hidden="true" />
      </button>

      {/* Dot pagination — wrapped in a 44 px touch row so each dot
          remains tap-reachable on mobile despite the visual size. */}
      <div className="mt-3 flex items-center justify-center gap-2">
        {images.map((_, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => scrollToIndex(idx)}
            aria-label={`Go to photo ${idx + 1}`}
            aria-current={idx === activeIndex ? "true" : undefined}
            className={`relative inline-flex h-11 w-6 items-center justify-center focus-visible:outline-none ${
              idx === activeIndex ? "" : ""
            }`}
          >
            <span
              aria-hidden="true"
              className={
                idx === activeIndex
                  ? "h-2 w-6 rounded-full bg-celo-dark transition-all peer-focus-visible:ring-2 dark:bg-celo-light"
                  : "h-2 w-2 rounded-full bg-celo-dark/30 transition-all dark:bg-celo-light/30"
              }
            />
          </button>
        ))}
      </div>
    </div>
  );
}
