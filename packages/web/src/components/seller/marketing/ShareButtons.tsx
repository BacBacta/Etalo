"use client";

import { ShareNetwork } from "@phosphor-icons/react";

interface Props {
  imageUrl: string;
  caption: string;
}

/** WhatsApp uses the wa.me universal intent (caption + URL). Instagram
 * has no public web share intent for posts — V1 sends the user to
 * instagram.com after they've downloaded the image. Native share intent
 * (mobile) deferred to V1.5+. */
export function ShareButtons({ imageUrl, caption }: Props) {
  const text = encodeURIComponent(`${caption}\n\n${imageUrl}`);

  return (
    <>
      <a
        href={`https://wa.me/?text=${text}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-[44px] items-center justify-center rounded-md bg-green-600 px-4 py-2 text-base text-white"
        data-testid="share-whatsapp"
      >
        <ShareNetwork className="mr-2 h-4 w-4" aria-hidden />
        WhatsApp
      </a>
      <a
        href="https://www.instagram.com/"
        target="_blank"
        rel="noopener noreferrer"
        title="Download image first, then share on Instagram"
        className="inline-flex min-h-[44px] items-center justify-center rounded-md bg-gradient-to-tr from-purple-600 to-pink-500 px-4 py-2 text-base text-white"
        data-testid="share-instagram"
      >
        <ShareNetwork className="mr-2 h-4 w-4" aria-hidden />
        Instagram
      </a>
    </>
  );
}
