"use client";

import { useState, useCallback, useRef } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Upload,
  CheckCircle2,
  AlertCircle,
  Camera,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { CameraViewer } from "@/components/camera/camera-viewer";
import { PhotoGallery } from "@/components/camera/photo-gallery";
import {
  uploadPhoto,
  type PhotoResponse,
  type PhotoType,
  type CameraSource,
} from "@/lib/api/camera";
import { cn } from "@/lib/utils";

// ── Upload Panel ─────────────────────────────────────────────────────────

function UploadPanel() {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{
    success: boolean;
    photo?: PhotoResponse;
    error?: string;
  } | null>(null);
  const [robotId, setRobotId] = useState("robot-001");
  const [photoType, setPhotoType] = useState<PhotoType>("snapshot");
  const [cameraSource, setCameraSource] = useState<CameraSource>("front");
  const [caption, setCaption] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = useCallback(async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadResult(null);

    try {
      const photo = await uploadPhoto({
        robot_id: robotId,
        photo_type: photoType,
        camera_source: cameraSource,
        caption: caption || undefined,
        file,
      });
      setUploadResult({ success: true, photo });
      // Reset
      if (fileRef.current) fileRef.current.value = "";
      setCaption("");
    } catch (err) {
      setUploadResult({
        success: false,
        error: err instanceof Error ? err.message : "Upload failed",
      });
    } finally {
      setIsUploading(false);
    }
  }, [robotId, photoType, cameraSource, caption]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Upload className="h-4 w-4" />
          Upload Photo
        </CardTitle>
        <CardDescription>
          Simulate uploading a camera image from a robot
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Robot</Label>
            <Select
              value={robotId}
              onChange={(e) => setRobotId(e.target.value)}
              className="h-8 text-xs"
            >
              <option value="robot-001">StairBot Alpha</option>
              <option value="robot-002">StairBot Beta</option>
              <option value="robot-003">StairBot Gamma</option>
              <option value="robot-004">StairBot Delta</option>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Photo Type</Label>
            <Select
              value={photoType}
              onChange={(e) => setPhotoType(e.target.value as PhotoType)}
              className="h-8 text-xs"
            >
              <option value="snapshot">Snapshot</option>
              <option value="delivery_proof">Delivery Proof</option>
              <option value="recipient_verify">Verification</option>
              <option value="obstacle">Obstacle</option>
              <option value="environment">Environment</option>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Camera</Label>
            <Select
              value={cameraSource}
              onChange={(e) => setCameraSource(e.target.value as CameraSource)}
              className="h-8 text-xs"
            >
              <option value="front">Front</option>
              <option value="rear">Rear</option>
              <option value="verification">Verification</option>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Caption</Label>
            <Input
              placeholder="Optional caption..."
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Image File</Label>
          <Input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="h-8 text-xs"
          />
        </div>

        <Button
          onClick={handleUpload}
          disabled={isUploading}
          className="w-full sm:w-auto"
          size="sm"
        >
          {isUploading ? (
            <>Uploading...</>
          ) : (
            <>
              <Upload className="mr-2 h-4 w-4" />
              Upload
            </>
          )}
        </Button>

        {/* Result feedback */}
        {uploadResult && (
          <div
            className={cn(
              "flex items-start gap-2 rounded-lg border p-3 text-sm",
              uploadResult.success
                ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
                : "border-red-500/30 bg-red-500/5 text-red-700 dark:text-red-400",
            )}
          >
            {uploadResult.success ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <div>
              {uploadResult.success ? (
                <p>
                  Uploaded <strong>{uploadResult.photo?.filename}</strong>{" "}
                  ({uploadResult.photo?.size_bytes} bytes)
                </p>
              ) : (
                <p>{uploadResult.error}</p>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────

export default function CameraPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        icon={Camera}
        title="Live Robot Camera"
        description="Live camera streams, snapshots, and photo uploads from robot cameras"
      />

      {/* Live Viewer + Upload side-by-side */}
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <CameraViewer />
        <UploadPanel />
      </div>

      {/* Photo Gallery */}
      <PhotoGallery />
    </div>
  );
}
