"use client";

import { useEffect, useRef, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Map, Radio, RotateCcw, ScanLine } from "lucide-react";
import { LidarViz } from "@/components/navigation/lidar-viz";
import type { LidarPoint, SlamMapData } from "@/hooks/use-navigation-socket";

type LidarMapPanelProps = {
  mapPoints: LidarPoint[];
  lidarPoints: LidarPoint[];
  lidarFov: number;
  heading: number;
  path?: Array<{ x: number; y: number }>;
  slamMap: SlamMapData | null;
  robotPose: { x: number; y: number; heading: number } | null;
  onResetMap: () => void;
};

export function LidarMapPanel({
  mapPoints,
  lidarPoints,
  lidarFov,
  heading,
  path,
  slamMap,
  robotPose,
  onResetMap,
}: LidarMapPanelProps) {
  const [mapMode, setMapMode] = useState<"scan" | "slam">("scan");
  const [staticMap, setStaticMap] = useState<{
    imageDataUri: string;
    width: number;
    height: number;
    resolution: number;
    originX: number;
    originY: number;
  } | null>(null);

  useEffect(() => {
    fetch("/api/v1/map/static")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (json?.data) {
          setStaticMap({
            imageDataUri: json.data.image_data_uri,
            width: json.data.width,
            height: json.data.height,
            resolution: json.data.resolution,
            originX: json.data.origin_x,
            originY: json.data.origin_y,
          });
        }
      })
      .catch(() => null);
  }, []);

  const prevSlamRef = useRef<typeof slamMap>(null);
  useEffect(() => {
    if (slamMap && !prevSlamRef.current) {
      setMapMode("slam");
    }
    prevSlamRef.current = slamMap;
  }, [slamMap]);

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Radio className="h-4 w-4" />
          {mapMode === "slam" ? "SLAM Map" : "LIDAR Scan"}
        </CardTitle>
        <CardDescription className="text-xs">
          {mapMode === "slam"
            ? slamMap
              ? `Live SLAM · ${slamMap.slam_mode ?? "mapping"} · ${slamMap.map_points?.length ?? 0} cells`
              : staticMap
                ? "Pre-built map (start ros2_bridge for live SLAM)"
                : "No map data — start ros2_bridge on the Pi"
            : `Real-time scan · ${mapPoints.length || lidarPoints.length} pts · ${lidarFov}° FOV`}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col items-center gap-3 p-4">
        <div className="flex w-full gap-2">
          <Button
            size="sm"
            variant={mapMode === "scan" ? "default" : "outline"}
            className="flex-1 gap-1.5"
            onClick={() => setMapMode("scan")}
          >
            <ScanLine className="h-3.5 w-3.5" />
            Live Scan
          </Button>
          <Button
            size="sm"
            variant={mapMode === "slam" ? "default" : "outline"}
            className="flex-1 gap-1.5"
            onClick={() => setMapMode("slam")}
          >
            <Map className="h-3.5 w-3.5" />
            SLAM Map
            {slamMap && (
              <span className="ml-1 h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
            )}
          </Button>
        </div>

        <LidarViz
          points={mapPoints.length ? mapPoints : lidarPoints}
          fov={lidarFov}
          heading={heading}
          path={path}
          size={340}
          maxRange={6}
          slamMap={slamMap}
          robotPose={robotPose}
          mapMode={mapMode}
          staticMapDataUri={staticMap?.imageDataUri}
          staticMapWidth={staticMap?.width}
          staticMapHeight={staticMap?.height}
          staticMapResolution={staticMap?.resolution}
          staticMapOriginX={staticMap?.originX}
          staticMapOriginY={staticMap?.originY}
        />
      </CardContent>
      <div className="border-t px-4 pb-4">
        <Button size="sm" variant="outline" className="w-full" onClick={onResetMap}>
          <RotateCcw className="mr-2 h-4 w-4" />
          Reset Map
        </Button>
      </div>
    </Card>
  );
}
