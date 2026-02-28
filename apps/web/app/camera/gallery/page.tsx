"use client";

import { PhotoGallery } from "@/components/camera/photo-gallery";

export default function GalleryPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Photo Gallery
        </h1>
        <p className="text-sm text-muted-foreground">
          Browse, filter, and manage all photos captured by robot cameras
        </p>
      </div>

      {/* Full-width gallery */}
      <PhotoGallery />
    </div>
  );
}
