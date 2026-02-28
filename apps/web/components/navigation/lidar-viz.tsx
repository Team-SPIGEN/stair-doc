/**
 * LidarViz — Canvas-based 2D LIDAR point-cloud visualiser.
 *
 * Renders LIDAR scan data as a polar → cartesian plot on a 400×400 canvas.
 * Features:
 *   • Red dots for obstacles (<2 m)
 *   • Green heading indicator line
 *   • Blue target waypoint path
 *   • Yellow 270° FOV arc
 *   • Distance rings every 1 m
 *   • 10 fps update cycle via requestAnimationFrame
 */
"use client";

import { useRef, useEffect, useCallback } from "react";
import type { LidarPoint } from "@/hooks/use-navigation-socket";

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
}

const OBSTACLE_THRESHOLD = 2; // metres — anything closer is "close"
const RING_COUNT = 6; // distance rings
const DEG2RAD = Math.PI / 180;

export function LidarViz({
  points,
  fov = 270,
  heading = 0,
  path,
  size = 400,
  maxRange = 6,
}: LidarVizProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number>(0);
  const pointsRef = useRef(points);
  const headingRef = useRef(heading);
  const pathRef = useRef(path);

  // Keep refs in sync without triggering re-render loop
  useEffect(() => {
    pointsRef.current = points;
  }, [points]);

  useEffect(() => {
    headingRef.current = heading;
  }, [heading]);

  useEffect(() => {
    pathRef.current = path;
  }, [path]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = size;
    const h = size;

    // High-DPI
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cx = w / 2;
    const cy = h / 2;
    const scale = (w / 2 - 20) / maxRange; // px per metre

    // ── Background ──
    ctx.fillStyle = "#0a0f1a";
    ctx.fillRect(0, 0, w, h);

    // ── Distance rings ──
    ctx.strokeStyle = "rgba(100, 120, 150, 0.25)";
    ctx.lineWidth = 0.5;
    for (let r = 1; r <= RING_COUNT; r++) {
      ctx.beginPath();
      ctx.arc(cx, cy, r * scale, 0, Math.PI * 2);
      ctx.stroke();

      // Label
      ctx.fillStyle = "rgba(100, 120, 150, 0.6)";
      ctx.font = "9px monospace";
      ctx.textAlign = "center";
      ctx.fillText(`${r}m`, cx, cy - r * scale + 10);
    }

    // ── FOV arc ──
    const fovAngle = fov * DEG2RAD;
    const startAngle = -Math.PI / 2 - fovAngle / 2; // 0° = up
    const endAngle = -Math.PI / 2 + fovAngle / 2;
    ctx.strokeStyle = "rgba(250, 204, 21, 0.3)"; // yellow
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, (w / 2 - 20), startAngle, endAngle);
    ctx.closePath();
    ctx.fillStyle = "rgba(250, 204, 21, 0.04)";
    ctx.fill();
    ctx.stroke();

    // ── LIDAR points ──
    const pts = pointsRef.current;
    for (let i = 0; i < pts.length; i++) {
      const { angle, distance } = pts[i];
      if (distance <= 0 || distance > maxRange) continue;

      // Polar → cartesian (0° = up / north)
      const rad = (angle - 90) * DEG2RAD;
      const px = cx + Math.cos(rad) * distance * scale;
      const py = cy + Math.sin(rad) * distance * scale;

      const isClose = distance < OBSTACLE_THRESHOLD;
      ctx.fillStyle = isClose
        ? "rgba(239, 68, 68, 0.9)" // red
        : "rgba(34, 197, 94, 0.6)"; // green

      ctx.beginPath();
      ctx.arc(px, py, isClose ? 3 : 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // ── Waypoint path ──
    const wp = pathRef.current;
    if (wp && wp.length > 0) {
      ctx.strokeStyle = "rgba(59, 130, 246, 0.7)"; // blue
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

      // Draw waypoint dots
      for (let i = 0; i < wp.length; i++) {
        const px = cx + wp[i].x * scale;
        const py = cy - wp[i].y * scale;
        ctx.fillStyle = "rgba(59, 130, 246, 0.9)";
        ctx.beginPath();
        ctx.arc(px, py, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // ── Heading line ──
    const hRad = (headingRef.current - 90) * DEG2RAD;
    ctx.strokeStyle = "rgba(34, 197, 94, 0.8)"; // green
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(hRad) * 30, cy + Math.sin(hRad) * 30);
    ctx.stroke();

    // ── Robot centre marker ──
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.stroke();
  }, [size, maxRange, fov]);

  // Render loop at ~10 fps
  useEffect(() => {
    let lastTime = 0;
    const TARGET_INTERVAL = 100; // 10 fps

    const loop = (time: number) => {
      if (time - lastTime >= TARGET_INTERVAL) {
        draw();
        lastTime = time;
      }
      frameRef.current = requestAnimationFrame(loop);
    };

    frameRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frameRef.current);
    };
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: size, height: size }}
      className="rounded-lg border border-border"
    />
  );
}
