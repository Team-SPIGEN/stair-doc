/**
 * Socket.IO client singleton for Stair-Doc real-time communication.
 *
 * Connects to the FastAPI backend's Socket.IO server mounted at /ws/socket.io.
 * Uses the same base URL as the REST API (OpenAPI.BASE).
 */

import { io, Socket } from "socket.io-client";
import { OpenAPI } from "@/lib/api/client";

let socket: Socket | null = null;

/**
 * Get or create the singleton Socket.IO client.
 *
 * In development: connects to http://127.0.0.1:8000
 * In production: connects to the OpenAPI.BASE URL
 */
export function getSocket(): Socket {
  if (socket) return socket;

  const baseUrl =
    process.env.NEXT_PUBLIC_SOCKET_URL ??
    (typeof window !== "undefined" && window.location.hostname === "localhost"
      ? "http://127.0.0.1:8000"
      : OpenAPI.BASE);

  socket = io(baseUrl, {
    path: "/socket.io",
    transports: ["websocket", "polling"],
    autoConnect: false,
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 10000,
  });

  return socket;
}

/**
 * Disconnect and destroy the singleton socket.
 */
export function destroySocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
