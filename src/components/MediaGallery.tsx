import React, { useRef, useEffect, useState } from "react";

interface MediaItem {
  id: number;
  filename: string;
  original_name: string;
  mime_type: string;
}

function UpgradingImage({ thumbSrc, fullSrc, alt, className }: { thumbSrc: string; fullSrc: string; alt: string; className: string }) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [src, setSrc] = useState(thumbSrc);

  useEffect(() => {
    const img = imgRef.current;
    if (!img || thumbSrc === fullSrc) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          const full = new Image();
          full.src = fullSrc;
          full.onload = () => setSrc(fullSrc);
          observer.disconnect();
        }
      },
      { threshold: 0 },
    );
    observer.observe(img);
    return () => observer.disconnect();
  }, [thumbSrc, fullSrc]);

  return <img ref={imgRef} src={src} alt={alt} className={className} />;
}

export function MediaGallery({ media }: { media: MediaItem[] }) {
  if (!media.length) return null;

  const videos = media.filter((item) => item.mime_type.startsWith("video/"));
  const images = media.filter((item) => !item.mime_type.startsWith("video/"));

  return (
    <div className="mt-3 flex flex-col gap-2">
      {videos.map((item) => (
        <video
          key={item.id}
          src={`/uploads/${item.filename}`}
          controls
          playsInline
          className="w-full rounded-lg max-h-96 object-cover"
        />
      ))}
      {images.length > 0 && (
        <div className={`grid gap-2 ${images.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
          {images.map((item, index) => {
            const src = `/uploads/${item.filename}`;
            const thumbSrc = item.mime_type === "image/gif" ? src : `/thumbs/${item.filename}`;
            const popoverId = `media-popover-${item.id}`;
            const isAlone = images.length === 1 || (images.length % 2 === 1 && index === images.length - 1);
            return (
              <div key={item.id} className={isAlone ? "col-span-full" : ""}>
                <button
                  // @ts-ignore: popoverTarget not yet in React types
                  popoverTarget={popoverId}
                  className="w-full cursor-pointer border-0 p-0 bg-transparent"
                >
                  <UpgradingImage
                    thumbSrc={thumbSrc}
                    fullSrc={src}
                    alt={item.original_name}
                    className={`w-full rounded-lg hover:opacity-90 transition-opacity ${isAlone ? "h-auto object-contain" : "aspect-square object-cover"}`}
                  />
                </button>
                <div
                  id={popoverId}
                  // @ts-ignore: popover not yet in React types
                  popover=""
                  className="p-0 border-0 rounded-xl max-w-[90vw] max-h-[90vh] backdrop:bg-black/50 m-auto"
                >
                  <img
                    src={src}
                    alt={item.original_name}
                    className="max-w-[90vw] max-h-[90vh] rounded-xl object-contain"
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
