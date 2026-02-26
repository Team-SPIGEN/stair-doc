// Stair-Doc Dashboard Types

export type RobotStatus = 
  | "idle"
  | "climbing"
  | "descending"
  | "delivering"
  | "returning"
  | "charging"
  | "maintenance"
  | "emergency"
  | "offline";

export type DeliveryStatus = 
  | "pending"
  | "assigned"
  | "picked_up"
  | "in_transit"
  | "climbing_stairs"
  | "arrived"
  | "delivered"
  | "failed"
  | "cancelled";

export interface Location {
  latitude: number;
  longitude: number;
  floor: number;
  building: string;
  room?: string;
}

export interface Robot {
  id: string;
  name: string;
  serialNumber: string;
  status: RobotStatus;
  batteryLevel: number;
  currentLocation: Location;
  currentDeliveryId?: string;
  speed: number;
  stairsClimbed: number;
  totalDeliveries: number;
  lastSeen: string;
}

export interface Delivery {
  id: string;
  robotId: string;
  orderId: string;
  status: DeliveryStatus;
  pickupLocation: Location;
  dropoffLocation: Location;
  estimatedArrival: string;
  actualArrival?: string;
  packageWeight: number;
  priority: "normal" | "urgent" | "express";
  createdAt: string;
  updatedAt: string;
}

export interface RobotTelemetry {
  robotId: string;
  timestamp: string;
  location: {
    latitude: number;
    longitude: number;
    floor: number;
    heading: number;
    speed: number;
  };
  battery: {
    level: number;
    isCharging: boolean;
    voltage: number;
    temperature: number;
    estimatedMinutesRemaining: number;
  };
  motors: {
    leftSpeed: number;
    rightSpeed: number;
    climbingMotorActive: boolean;
  };
  sensors: {
    obstacleDetected: boolean;
    stairDetected: boolean;
    distanceToObstacle?: number;
    inclineAngle: number;
  };
}

export interface ActivityEvent {
  id: string;
  type: "delivery" | "status" | "alert" | "system";
  robotId?: string;
  robotName?: string;
  message: string;
  timestamp: string;
  severity: "info" | "success" | "warning" | "error";
  metadata?: Record<string, unknown>;
}

export interface DashboardStats {
  activeRobots: number;
  totalRobots: number;
  deliveriesToday: number;
  successRate: number;
  avgDeliveryTime: number;
  stairsClimbedToday: number;
  robotsCharging: number;
  pendingDeliveries: number;
}
