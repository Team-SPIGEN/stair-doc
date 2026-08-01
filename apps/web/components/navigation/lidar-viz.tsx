/**
 * LidarViz — Canvas-based 2D LIDAR + SLAM visualiser.
 *
 * Two render modes selectable via the `mapMode` prop:
 *
 *  "scan" (default) — polar point-cloud view (original behaviour):
 *    • Red dots for obstacles (< 2 m), green for clear space
 *    • Yellow FOV arc, green heading indicator, blue waypoint path
 *    • Distance rings every 1 m
 *
 *  "slam" — OccupancyGrid map view (new):
 *    • Renders world-frame obstacle cells as a top-down 2D map
 *    • Overlays current live /scan points on the map in real-time
 *    • Shows robot pose as a directional arrow
 *    • Supports pan and zoom via mouse wheel / touch pinch
 *    • Shows static pre-built map image as background when provided
 */
"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import type { LidarPoint, SlamMapData } from "@/hooks/use-navigation-socket";

interface LidarVizProps {
  /** Array of LIDAR scan points (angle in degrees, distance in metres). */
  points: LidarPoint[];
  /** Field of view in degrees (default: 270). */
  fov?: number;
  /** Robot heading in degrees (0 = north / up). */
  heading?: number;
  /** Optional waypoint path to render as blue dots. */
  path?: Array<{ x: number; y: number }>;
  /** Canvas width & height in CSS pixels (default: 400). */
  size?: number;
  /** Max distance in metres for the plot range (default: 6). */
  maxRange?: number;
  /** SLAM OccupancyGrid snapshot (null = no live SLAM). */
  slamMap?: SlamMapData | null;
  /** Robot world-frame pose {x, y, heading°}. */
  robotPose?: { x: number; y: number; heading: number } | null;
  /** Which render mode to show. */
  mapMode?: "scan" | "slam";
  /** Optional pre-built static map image data URI for background. */
  staticMapDataUri?: string | null;
  staticMapWidth?: number;
  staticMapHeight?: number;
  staticMapResolution?: number;
  staticMapOriginX?: number;
  staticMapOriginY?: number;
}

const OBSTACLE_THRESHOLD = 2; // metres
const RING_COUNT = 6;
const DEG2RAD = Math.PI / 180;

export function LidarViz({
  points,
  fov = 270,
  heading = 0,
  path,
  size = 400,
  maxRange = 6,
  slamMap = null,
  robotPose = null,
  mapMode = "scan",
  staticMapDataUri = null,
  staticMapWidth,
  staticMapHeight,
  staticMapResolution = 0.05,
  staticMapOriginX = 0,
  staticMapOriginY = 0,
}: LidarVizProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number>(0);

  // Refs for render loop (avoids re-creating the animation loop on state changes)
  const pointsRef = useRef(points);
  const headingRef = useRef(heading);
  const pathRef = useRef(path);
  const slamMapRef = useRef(slamMap);
  const robotPoseRef = useRef(robotPose);
  const mapModeRef = useRef(mapMode);
  const staticImgRef = useRef<HTMLImageElement | null>(null);

  // Pan / zoom state for SLAM view
  const panRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(1.0);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const panStartRef = useRef({ x: 0, y: 0 });

  // Keep refs in sync
  useEffect(() => { pointsRef.current = points; }, [points]);
  useEffect(() => { headingRef.current = heading; }, [heading]);
  useEffect(() => { pathRef.current = path; }, [path]);
  useEffect(() => { slamMapRef.current = slamMap; }, [slamMap]);
  useEffect(() => { robotPoseRef.current = robotPose; }, [robotPose]);
  useEffect(() => { mapModeRef.current = mapMode; }, [mapMode]);

  // Load static map image when URI changes
  useEffect(() => {
    if (!staticMapDataUri) {
      staticImgRef.current = null;
      return;
    }
    const img = new Image();
    img.onload = () => { staticImgRef.current = img; };
    img.src = staticMapDataUri;
  }, [staticMapDataUri]);

  // ── SCAN MODE draw ──────────────────────────────────────────────────────
  const drawScan = useCallback(
    (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      const cx = w / 2;
      const cy = h / 2;
      const scale = (w / 2 - 20) / maxRange;

      ctx.fillStyle = "#0a0f1a";
      ctx.fillRect(0, 0, w, h);

      // Distance rings
      ctx.strokeStyle = "rgba(100, 120, 150, 0.25)";
      ctx.lineWidth = 0.5;
      for (let r = 1; r <= RING_COUNT; r++) {
        ctx.beginPath();
        ctx.arc(cx, cy, r * scale, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = "rgba(100, 120, 150, 0.6)";
        ctx.font = "9px monospace";
        ctx.textAlign = "center";
        ctx.fillText(`${r}m`, cx, cy - r * scale + 10);
      }

      // FOV arc
      const fovAngle = fov * DEG2RAD;
      const startAngle = -Math.PI / 2 - fovAngle / 2;
      const endAngle = -Math.PI / 2 + fovAngle / 2;
      ctx.strokeStyle = "rgba(250, 204, 21, 0.3)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, w / 2 - 20, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = "rgba(250, 204, 21, 0.04)";
      ctx.fill();
      ctx.stroke();

      // LIDAR points
      const pts = pointsRef.current;
      for (let i = 0; i < pts.length; i++) {
        const { angle, distance } = pts[i];
        if (distance <= 0 || distance > maxRange) continue;
        const rad = (angle - 90) * DEG2RAD;
        const px = cx + Math.cos(rad) * distance * scale;
        const py = cy + Math.sin(rad) * distance * scale;
        const isClose = distance < OBSTACLE_THRESHOLD;
        ctx.fillStyle = isClose
          ? "rgba(239, 68, 68, 0.9)"
          : "rgba(34, 197, 94, 0.6)";
        ctx.beginPath();
        ctx.arc(px, py, isClose ? 3 : 2, 0, Math.PI * 2);
        ctx.fill();
      }

      // Waypoint path
      const wp = pathRef.current;
      if (wp && wp.length > 0) {
        ctx.strokeStyle = "rgba(59, 130, 246, 0.7)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        for (let i = 0; i < wp.length; i++) {
          const px = cx + wp[i].x * scale;
          const py = cy - wp[i].y * scale;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
        ctx.setLineDash([]);
        for (let i = 0; i < wp.length; i++) {
          ctx.fillStyle = "rgba(59, 130, 246, 0.9)";
          ctx.beginPath();
          ctx.arc(cx + wp[i].x * scale, cy - wp[i].y * scale, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Heading line
      const hRad = (headingRef.current - 90) * DEG2RAD;
      ctx.strokeStyle = "rgba(34, 197, 94, 0.8)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(hRad) * 30, cy + Math.sin(hRad) * 30);
      ctx.stroke();

      // Robot marker
      ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
      ctx.beginPath();
      ctx.arc(cx, cy, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, 6, 0, Math.PI * 2);
      ctx.stroke();
    },
    [size, maxRange, fov],
  );

  // ── SLAM MODE draw ──────────────────────────────────────────────────────
  const drawSlam = useCallback(
    (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      ctx.fillStyle = "#0a0f1a";
      ctx.fillRect(0, 0, w, h);

      const slam = slamMapRef.current;
      const pose = robotPoseRef.current;
      const zoom = zoomRef.current;
      const pan = panRef.current;

      // Grid info — fall back to live slam map metadata or reasonable defaults
      const resolution = slam?.resolution ?? staticMapResolution;
      const originX = slam?.origin_x ?? staticMapOriginX;
      const originY = slam?.origin_y ?? staticMapOriginY;
      const gridW = slam?.width ?? staticMapWidth ?? 0;
      const gridH = slam?.height ?? staticMapHeight ?? 0;

      // World → canvas transform
      // Centre of canvas = robot pose (if known) or map centre
      const pxPerMetre = zoom * (w / (gridW * resolution || 20));

      const worldCentreX = pose ? pose.x : originX + (gridW * resolution) / 2;
      const worldCentreY = pose ? pose.y : originY + (gridH * resolution) / 2;

      const toCanvas = (wx: number, wy: number): [number, number] => {
        const cx = w / 2 + pan.x + (wx - worldCentreX) * pxPerMetre;
        const cy = h / 2 + pan.y - (wy - worldCentreY) * pxPerMetre; // y-flip
        return [cx, cy];
      };

      // Draw static background image if loaded
      if (staticImgRef.current && gridW > 0 && gridH > 0) {
        const [bx, by] = toCanvas(originX, originY + gridH * resolution);
        const bw = gridW * resolution * pxPerMetre;
        const bh = gridH * resolution * pxPerMetre;
        ctx.globalAlpha = 0.55;
        ctx.drawImage(staticImgRef.current, bx, by, bw, bh);
        ctx.globalAlpha = 1.0;
      } else {
        // Draw grid background
        ctx.fillStyle = "#0e1520";
        ctx.fillRect(0, 0, w, h);
        // Grid lines
        if (gridW > 0 && gridH > 0) {
          ctx.strokeStyle = "rgba(40,60,90,0.3)";
          ctx.lineWidth = 0.5;
          const step = Math.max(1, Math.floor(1 / (resolution * pxPerMetre)));
          for (let gx = 0; gx <= gridW; gx += step) {
            const [cx] = toCanvas(originX + gx * resolution, originY);
            ctx.beginPath();
            ctx.moveTo(cx, 0);
            ctx.lineTo(cx, h);
            ctx.stroke();
          }
          for (let gy = 0; gy <= gridH; gy += step) {
            const [, cy] = toCanvas(originX, originY + gy * resolution);
            ctx.beginPath();
            ctx.moveTo(0, cy);
            ctx.lineTo(w, cy);
            ctx.stroke();
          }
        }
      }

      // Draw SLAM world-frame obstacle points from OccupancyGrid
      if (slam?.map_points && slam.map_points.length > 0) {
        const dotSize = Math.max(1.5, pxPerMetre * resolution * 0.8);
        ctx.fillStyle = "rgba(99,179,237,0.75)"; // blue-300
        for (const pt of slam.map_points) {
          const [cx, cy] = toCanvas(pt.x, pt.y);
          if (cx < -2 || cx > w + 2 || cy < -2 || cy > h + 2) continue;
          ctx.beginPath();
          ctx.arc(cx, cy, dotSize, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Overlay current /scan points (robot-frame → world-frame using pose)
      const livePts = pointsRef.current;
      if (livePts.length > 0) {
        const posX = pose?.x ?? 0;
        const posY = pose?.y ?? 0;
        const poseHeadRad = ((pose?.heading ?? 0)) * DEG2RAD;
        for (const { angle, distance } of livePts) {
          if (distance <= 0 || distance > maxRange) continue;
          const localRad = (angle - 90) * DEG2RAD;
          const worldAngle = localRad + poseHeadRad;
          const wx = posX + Math.cos(worldAngle) * distance;
          const wy = posY + Math.sin(worldAngle) * distance;
          const [cx, cy] = toCanvas(wx, wy);
          if (cx < -2 || cx > w + 2 || cy < -2 || cy > h + 2) continue;
          ctx.fillStyle =
            distance < OBSTACLE_THRESHOLD
              ? "rgba(239,68,68,0.85)"
              : "rgba(74,222,128,0.55)";
          ctx.beginPath();
          ctx.arc(cx, cy, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Robot pose arrow
      if (pose) {
        const [rx, ry] = toCanvas(pose.x, pose.y);
        const arrowLen = 18;
        const arrowRad = (90 - pose.heading) * DEG2RAD; // canvas: 0=right, CCW
        ctx.strokeStyle = "#22d3ee"; // cyan-400
        ctx.fillStyle = "#22d3ee";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(rx, ry);
        ctx.lineTo(rx + Math.cos(arrowRad) * arrowLen, ry - Math.sin(arrowRad) * arrowLen);
        ctx.stroke();
        // Arrow head
        const hx = rx + Math.cos(arrowRad) * arrowLen;
        const hy = ry - Math.sin(arrowRad) * arrowLen;
        const al = 7;
        const aw = 0.4;
        ctx.beginPath();
        ctx.moveTo(hx, hy);
        ctx.lineTo(
          hx - Math.cos(arrowRad - aw) * al,
          hy + Math.sin(arrowRad - aw) * al,
        );
        ctx.lineTo(
          hx - Math.cos(arrowRad + aw) * al,
          hy + Math.sin(arrowRad + aw) * al,
        );
        ctx.closePath();
        ctx.fill();
        // Centre dot
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(rx, ry, 4, 0, Math.PI * 2);
        ctx.fill();
      }

      // Scale bar
      const scaleMetre = pxPerMetre;
      const barM = scaleMetre > 40 ? 1 : scaleMetre > 10 ? 2 : 5;
      const barPx = barM * scaleMetre;
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      ctx.fillRect(12, h - 18, barPx, 3);
      ctx.font = "9px monospace";
      ctx.fillText(`${barM}m`, 12 + barPx + 4, h - 13);

      // SLAM mode label
      if (slam?.slam_mode) {
        ctx.fillStyle = "rgba(34,211,238,0.8)";
        ctx.font = "bold 10px monospace";
        ctx.textAlign = "right";
        ctx.fillText(
          slam.slam_mode === "mapping" ? "● SLAM MAPPING" : "● NAV2 LOCALIZATION",
          w - 10,
          16,
        );
        ctx.textAlign = "left";
      }
    },
    [size, maxRange, staticMapResolution, staticMapOriginX, staticMapOriginY, staticMapWidth, staticMapHeight],
  );

  // ── Unified render loop at ~15 fps ──────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (mapModeRef.current === "slam") {
      drawSlam(ctx, size, size);
    } else {
      drawScan(ctx, size, size);
    }
  }, [size, drawScan, drawSlam]);

  useEffect(() => {
    let lastTime = 0;
    const TARGET_INTERVAL = 67; // ~15 fps

    const loop = (time: number) => {
      if (time - lastTime >= TARGET_INTERVAL) {
        draw();
        lastTime = time;
      }
      frameRef.current = requestAnimationFrame(loop);
    };
    frameRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameRef.current);
  }, [draw]);

  // ── Pan / zoom event handlers for SLAM mode ─────────────────────────────
  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLCanvasElement>) => {
      if (mapModeRef.current !== "slam") return;
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.12 : 0.89;
      zoomRef.current = Math.max(0.1, Math.min(20, zoomRef.current * factor));
    },
    [],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (mapModeRef.current !== "slam") return;
      isDraggingRef.current = true;
      dragStartRef.current = { x: e.clientX, y: e.clientY };
      panStartRef.current = { ...panRef.current };
    },
    [],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!isDraggingRef.current) return;
      panRef.current = {
        x: panStartRef.current.x + (e.clientX - dragStartRef.current.x),
        y: panStartRef.current.y + (e.clientY - dragStartRef.current.y),
      };
    },
    [],
  );

  const handleMouseUp = useCallback(() => {
    isDraggingRef.current = false;
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: size, height: size, cursor: mapMode === "slam" ? "grab" : "default" }}
      className="rounded-lg border border-border"
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    />
  );
}
