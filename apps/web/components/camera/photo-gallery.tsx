"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ImageIcon,
  Calendar,
  Filter,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  X,
  Trash2,
  Search,
  ZoomIn,
} from "lucide-react";
import {
  fetchPhotos,
  deletePhoto as apiDeletePhoto,
  type PhotoResponse,
  type PhotoType,
  type FetchPhotosParams,
} from "@/lib/api/camera";
import { getSocket } from "@/lib/socket/client";
import { cn } from "@/lib/utils";

// ── Photo type label + color map ─────────────────────────────────────────

const PHOTO_TYPE_CONFIG: Record<
  PhotoType,
  { label: string; variant: "default" | "success" | "destructive" | "warning" | "info" }
> = {
  delivery_proof: { label: "Delivery Proof", variant: "success" },
  recipient_verify: { label: "Verification", variant: "info" },
  obstacle: { label: "Obstacle", variant: "destructive" },
  snapshot: { label: "Snapshot", variant: "default" },
  environment: { label: "Environment", variant: "warning" },
};

// ── Date range quick-picks ───────────────────────────────────────────────

type DateRangePreset = "24h" | "7d" | "30d" | "all";

function getDateRangeFrom(preset: DateRangePreset): string {
  if (preset === "all") return "";
  const now = new Date();
  const offsets: Record<string, number> = { "24h": 1, "7d": 7, "30d": 30 };
  const d = new Date(now.getTime() - (offsets[preset] ?? 1) * 86_400_000);
  return d.toISOString();
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── Photo card (grid item) ───────────────────────────────────────────────

function PhotoCard({
  photo,
  onSelect,
}: {
  photo: PhotoResponse;
  onSelect: (photo: PhotoResponse) => void;
}) {
  const config = PHOTO_TYPE_CONFIG[photo.photo_type] ?? {
    label: photo.photo_type,
    variant: "default" as const,
  };

  return (
    <Card
      className="group cursor-pointer overflow-hidden transition-all hover:ring-2 hover:ring-primary/40"
      onClick={() => onSelect(photo)}
    >
      {/* Thumbnail placeholder */}
      <div className="relative aspect-video w-full overflow-hidden bg-gradient-to-br from-muted/50 to-muted">
        <div className="flex h-full items-center justify-center">
          <ImageIcon className="h-8 w-8 text-muted-foreground/40" />
        </div>

        {/* Overlay badges */}
        <div className="absolute left-2 top-2">
          <Badge variant={config.variant} className="text-[10px]">
            {config.label}
          </Badge>
        </div>
        <div className="absolute right-2 top-2 text-[10px] text-white/70 bg-black/40 px-1.5 py-0.5 rounded">
          {photo.width}x{photo.height}
        </div>

        {/* Hover overlay */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
          <ZoomIn className="h-6 w-6 text-white" />
        </div>
      </div>

      <CardContent className="p-3">
        <p className="truncate text-sm font-medium">{photo.caption ?? photo.filename}</p>
        <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
          <span>{formatDate(photo.captured_at)}</span>
          <span>{formatBytes(photo.size_bytes)}</span>
        </div>
        <p className="mt-0.5 text-[10px] text-muted-foreground/70">
          {photo.robot_id} · {photo.camera_source}
          {photo.robot_floor != null && ` · Floor ${photo.robot_floor}`}
        </p>
      </CardContent>
    </Card>
  );
}

// ── Zoom / Lightbox Modal ────────────────────────────────────────────────

function PhotoZoomModal({
  photo,
  onClose,
  onDelete,
}: {
  photo: PhotoResponse;
  onClose: () => void;
  onDelete: (id: string) => void;
}) {
  const config = PHOTO_TYPE_CONFIG[photo.photo_type] ?? {
    label: photo.photo_type,
    variant: "default" as const,
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl overflow-hidden rounded-xl border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="absolute right-2 top-2 z-10 h-8 w-8 bg-black/40 text-white hover:bg-black/60"
        >
          <X className="h-4 w-4" />
        </Button>

        {/* Image placeholder */}
        <div className="relative aspect-video w-full bg-gradient-to-br from-muted/50 to-muted">
          <div className="flex h-full items-center justify-center">
            <ImageIcon className="h-16 w-16 text-muted-foreground/30" />
          </div>
          <div className="absolute left-3 top-3">
            <Badge variant={config.variant}>{config.label}</Badge>
          </div>
          <div className="absolute right-3 top-3 rounded bg-black/50 px-2 py-1 text-xs text-white">
            {photo.width} × {photo.height}
          </div>
        </div>

        {/* Details panel */}
        <div className="p-4 space-y-3">
          {photo.caption && (
            <p className="font-medium text-sm">{photo.caption}</p>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1.5 text-xs">
            <div>
              <span className="text-muted-foreground">Filename</span>
              <p className="truncate font-mono">{photo.filename}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Robot</span>
              <p>{photo.robot_id}</p>
            </div>
            {photo.delivery_id && (
              <div>
                <span className="text-muted-foreground">Delivery</span>
                <p>{photo.delivery_id}</p>
              </div>
            )}
            <div>
              <span className="text-muted-foreground">Camera</span>
              <p className="capitalize">{photo.camera_source}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Size</span>
              <p>{formatBytes(photo.size_bytes)}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Captured</span>
              <p>{new Date(photo.captured_at).toLocaleString()}</p>
            </div>
            {photo.robot_floor != null && (
              <div>
                <span className="text-muted-foreground">Floor</span>
                <p>{photo.robot_floor}</p>
              </div>
            )}
            {photo.recipient_rfid && (
              <div>
                <span className="text-muted-foreground">RFID Tag</span>
                <p className="font-mono">{photo.recipient_rfid}</p>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 pt-1">
            <Button variant="outline" size="sm" disabled>
              <Download className="mr-2 h-4 w-4" />
              Download
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => onDelete(photo.id)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main PhotoGallery ────────────────────────────────────────────────────

export function PhotoGallery() {
  const [photos, setPhotos] = useState<PhotoResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(12);
  const [isLoading, setIsLoading] = useState(true);
  const [zoomedPhoto, setZoomedPhoto] = useState<PhotoResponse | null>(null);

  // Filters
  const [filterType, setFilterType] = useState<PhotoType | "all">("all");
  const [filterRobot, setFilterRobot] = useState<string>("");
  const [filterDeliveryId, setFilterDeliveryId] = useState<string>("");
  const [datePreset, setDatePreset] = useState<DateRangePreset>("all");
  const [filterFrom, setFilterFrom] = useState<string>("");
  const [filterTo, setFilterTo] = useState<string>("");
  const [filtersOpen, setFiltersOpen] = useState(false);

  // ── Fetch ──────────────────────────────────────────────────────────

  const loadPhotos = useCallback(async () => {
    setIsLoading(true);
    try {
      const params: FetchPhotosParams = { page, page_size: pageSize };
      if (filterType !== "all") params.photo_type = filterType;
      if (filterRobot) params.robot_id = filterRobot;

      // Date range: quick-pick overrides manual inputs
      if (datePreset !== "all") {
        params.from = getDateRangeFrom(datePreset);
      } else {
        if (filterFrom) params.from = new Date(filterFrom).toISOString();
        if (filterTo) params.to = new Date(filterTo).toISOString();
      }

      const data = await fetchPhotos(params);

      // Client-side delivery ID filter (server doesn't support it yet)
      let filteredPhotos = data.photos;
      let filteredTotal = data.total;
      if (filterDeliveryId) {
        const lower = filterDeliveryId.toLowerCase();
        filteredPhotos = filteredPhotos.filter(
          (p) => p.delivery_id?.toLowerCase().includes(lower),
        );
        filteredTotal = filteredPhotos.length;
      }

      setPhotos(filteredPhotos);
      setTotal(filteredTotal);
    } catch {
      // Graceful degrade
    } finally {
      setIsLoading(false);
    }
  }, [page, pageSize, filterType, filterRobot, filterDeliveryId, datePreset, filterFrom, filterTo]);

  useEffect(() => {
    loadPhotos();
  }, [loadPhotos]);

  // ── WebSocket: auto-refresh on new_photo ───────────────────────────

  useEffect(() => {
    const socket = getSocket();
    if (!socket.connected) socket.connect();

    const onNewPhoto = () => {
      // Auto-refresh gallery when a new photo arrives
      loadPhotos();
    };

    socket.on("new_photo", onNewPhoto);
    return () => {
      socket.off("new_photo", onNewPhoto);
    };
  }, [loadPhotos]);

  // ── Delete handler ─────────────────────────────────────────────────

  const handleDelete = useCallback(
    async (photoId: string) => {
      try {
        await apiDeletePhoto(photoId);
        setZoomedPhoto(null);
        // Refresh gallery
        loadPhotos();
      } catch {
        // Silent fail — in production show toast
      }
    },
    [loadPhotos],
  );

  // ── Pagination ─────────────────────────────────────────────────────

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const clearFilters = () => {
    setFilterType("all");
    setFilterRobot("");
    setFilterDeliveryId("");
    setDatePreset("all");
    setFilterFrom("");
    setFilterTo("");
    setPage(1);
  };

  const hasActiveFilters =
    filterType !== "all" ||
    filterRobot !== "" ||
    filterDeliveryId !== "" ||
    datePreset !== "all" ||
    filterFrom !== "" ||
    filterTo !== "";

  return (
    <div className="space-y-4">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Photo Gallery</h2>
          <p className="text-xs text-muted-foreground">
            {total} photo{total !== 1 ? "s" : ""} captured
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={filtersOpen ? "secondary" : "outline"}
            size="sm"
            onClick={() => setFiltersOpen((o) => !o)}
          >
            <Filter className="mr-2 h-4 w-4" />
            Filters
            {hasActiveFilters && (
              <Badge variant="info" className="ml-1.5 px-1 py-0 text-[10px]">
                !
              </Badge>
            )}
          </Button>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* ── Filter Panel ────────────────────────────────────────────── */}
      {filtersOpen && (
        <Card>
          <CardContent className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Photo type */}
            <div className="space-y-1.5">
              <Label className="text-xs">Photo Type</Label>
              <Select
                value={filterType}
                onChange={(e) => {
                  setFilterType(e.target.value as PhotoType | "all");
                  setPage(1);
                }}
                className="h-8 text-xs"
              >
                <option value="all">All Types</option>
                <option value="delivery_proof">Delivery Proof</option>
                <option value="recipient_verify">Verification</option>
                <option value="obstacle">Obstacle</option>
                <option value="snapshot">Snapshot</option>
                <option value="environment">Environment</option>
              </Select>
            </div>

            {/* Robot */}
            <div className="space-y-1.5">
              <Label className="text-xs">Robot ID</Label>
              <Input
                placeholder="e.g. robot-001"
                value={filterRobot}
                onChange={(e) => {
                  setFilterRobot(e.target.value);
                  setPage(1);
                }}
                className="h-8 text-xs"
              />
            </div>

            {/* Delivery ID search */}
            <div className="space-y-1.5">
              <Label className="text-xs">
                <Search className="mr-1 inline h-3 w-3" />
                Delivery ID
              </Label>
              <Input
                placeholder="e.g. del-001"
                value={filterDeliveryId}
                onChange={(e) => {
                  setFilterDeliveryId(e.target.value);
                  setPage(1);
                }}
                className="h-8 text-xs"
              />
            </div>

            {/* Date quick-picks */}
            <div className="space-y-1.5">
              <Label className="text-xs">
                <Calendar className="mr-1 inline h-3 w-3" />
                Date Range
              </Label>
              <div className="flex gap-1">
                {(["24h", "7d", "30d", "all"] as DateRangePreset[]).map(
                  (preset) => (
                    <Button
                      key={preset}
                      variant={datePreset === preset ? "default" : "outline"}
                      size="sm"
                      className="h-7 px-2 text-[10px]"
                      onClick={() => {
                        setDatePreset(preset);
                        if (preset !== "all") {
                          setFilterFrom("");
                          setFilterTo("");
                        }
                        setPage(1);
                      }}
                    >
                      {preset === "all" ? "All" : preset}
                    </Button>
                  ),
                )}
              </div>
            </div>

            {/* Manual date range (when "all" is selected) */}
            {datePreset === "all" && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs">From</Label>
                  <Input
                    type="datetime-local"
                    value={filterFrom}
                    onChange={(e) => {
                      setFilterFrom(e.target.value);
                      setPage(1);
                    }}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">To</Label>
                  <Input
                    type="datetime-local"
                    value={filterTo}
                    onChange={(e) => {
                      setFilterTo(e.target.value);
                      setPage(1);
                    }}
                    className="h-8 text-xs"
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Photo Grid ──────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="overflow-hidden">
              <Skeleton className="aspect-video w-full" />
              <CardContent className="p-3 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : photos.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <ImageIcon className="h-12 w-12 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">
              No photos found
            </p>
            {hasActiveFilters && (
              <Button
                variant="link"
                size="sm"
                onClick={clearFilters}
                className="mt-1"
              >
                Clear filters
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {photos.map((photo) => (
            <PhotoCard
              key={photo.id}
              photo={photo}
              onSelect={setZoomedPhoto}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* ── Zoom Modal ──────────────────────────────────────────────── */}
      {zoomedPhoto && (
        <PhotoZoomModal
          photo={zoomedPhoto}
          onClose={() => setZoomedPhoto(null)}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
