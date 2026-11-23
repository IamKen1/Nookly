"use client";

import { useEffect, useRef, useState } from "react";
import { Package } from "lucide-react";

/**
 * Product thumbnail that never shows the browser's broken-image icon/alt text.
 * Falls back to a neutral placeholder when there is no image or it fails to load.
 */
export default function ProductImage({
  src,
  alt,
  className = "",
  iconClassName = "h-1/3 w-1/3",
  width,
  height,
}: {
  src: string | null | undefined;
  alt: string;
  className?: string;
  iconClassName?: string;
  width?: number;
  height?: number;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  // An image that failed before hydration never fires onError; catch it here.
  useEffect(() => {
    const img = imgRef.current;
    if (img && src && img.complete && img.naturalWidth === 0) setFailedSrc(src);
  }, [src]);

  if (!src || failedSrc === src) {
    return (
      <div
        role="img"
        aria-label={alt || undefined}
        className={`flex items-center justify-center bg-linear-to-br from-gray-100 to-gray-200 text-gray-400 ${className}`}
      >
        <Package className={iconClassName} strokeWidth={1.5} />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={imgRef}
      src={src}
      alt={alt}
      width={width}
      height={height}
      loading="lazy"
      decoding="async"
      onError={() => setFailedSrc(src)}
      className={`object-cover ${className}`}
    />
  );
}
