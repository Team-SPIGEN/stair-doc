"use client";

import { useEffect, useCallback, useRef, useState } from "react";
import type { 
  RobotTelemetry, 
  ActivityEvent, 
  DashboardStats,
  Robot 
} from "@/types/dashboard";

// Simulated data for demo - replace with real WebSocket connection
const MOCK_ROBOTS: Robot[] = [
  {
    id: "robot-001",
    name: "StairBot Alpha",
    serialNumber: "SB-001-2024",
    status: "delivering",
    batteryLevel: 78,
    currentLocation: { latitude: 37.7749, longitude: -122.4194, floor: 3, building: "Building A" },
    currentDeliveryId: "del-123",
    speed: 1.2,
    stairsClimbed: 156,
    totalDeliveries: 342,
    lastSeen: new Date().toISOString(),
  },
  {
    id: "robot-002",
    name: "StairBot Beta",
    serialNumber: "SB-002-2024",
    status: "climbing",
    batteryLevel: 45,
    currentLocation: { latitude: 37.7750, longitude: -122.4195, floor: 2, building: "Building B" },
    currentDeliveryId: "del-124",
    speed: 0.8,
    stairsClimbed: 89,
    totalDeliveries: 287,
    lastSeen: new Date().toISOString(),
  },
  {
    id: "robot-003",
    name: "StairBot Gamma",
    serialNumber: "SB-003-2024",
    status: "charging",
    batteryLevel: 23,
    currentLocation: { latitude: 37.7751, longitude: -122.4196, floor: 1, building: "Building A" },
    speed: 0,
    stairsClimbed: 201,
    totalDeliveries: 456,
    lastSeen: new Date().toISOString(),
  },
  {
    id: "robot-004",
    name: "StairBot Delta",
    serialNumber: "SB-004-2024",
    status: "idle",
    batteryLevel: 92,
    currentLocation: { latitude: 37.7752, longitude: -122.4197, floor: 1, building: "Building C" },
    speed: 0,
    stairsClimbed: 178,
    totalDeliveries: 389,
    lastSeen: new Date().toISOString(),
  },
];

const generateMockTelemetry = (robotId: string): RobotTelemetry => ({
  robotId,
  timestamp: new Date().toISOString(),
  location: {
    latitude: 37.7749 + Math.random() * 0.001,
    longitude: -122.4194 + Math.random() * 0.001,
    floor: Math.floor(Math.random() * 5) + 1,
    heading: Math.random() * 360,
    speed: Math.random() * 2,
  },
  battery: {
    level: Math.floor(Math.random() * 100),
    isCharging: Math.random() > 0.7,
    voltage: 24 + Math.random() * 4,
    temperature: 25 + Math.random() * 15,
    estimatedMinutesRemaining: Math.floor(Math.random() * 180),
  },
  motors: {
    leftSpeed: Math.random() * 100,
    rightSpeed: Math.random() * 100,
    climbingMotorActive: Math.random() > 0.5,
  },
  sensors: {
    obstacleDetected: Math.random() > 0.9,
    stairDetected: Math.random() > 0.7,
    distanceToObstacle: Math.random() * 5,
    inclineAngle: Math.random() * 45,
  },
});

const MOCK_ACTIVITIES: ActivityEvent[] = [
  {
    id: "evt-1",
    type: "delivery",
    robotId: "robot-001",
    robotName: "StairBot Alpha",
    message: "Delivery completed to Room 305",
    timestamp: new Date(Date.now() - 120000).toISOString(),
    severity: "success",
  },
  {
    id: "evt-2",
    type: "status",
    robotId: "robot-002",
    robotName: "StairBot Beta",
    message: "Started climbing stairs to Floor 4",
    timestamp: new Date(Date.now() - 300000).toISOString(),
    severity: "info",
  },
  {
    id: "evt-3",
    type: "alert",
    robotId: "robot-003",
    robotName: "StairBot Gamma",
    message: "Low battery warning - returning to charge",
    timestamp: new Date(Date.now() - 600000).toISOString(),
    severity: "warning",
  },
  {
    id: "evt-4",
    type: "system",
    message: "System health check completed",
    timestamp: new Date(Date.now() - 900000).toISOString(),
    severity: "info",
  },
];

interface UseStairDocDashboardReturn {
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  robots: Robot[];
  telemetry: Map<string, RobotTelemetry>;
  activities: ActivityEvent[];
  stats: DashboardStats;
  selectedRobot: Robot | null;
  selectRobot: (robotId: string | null) => void;
  sendEmergencyStop: (robotId?: string) => Promise<void>;
  refreshData: () => void;
}

export function useStairDocDashboard(): UseStairDocDashboardReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [robots, setRobots] = useState<Robot[]>([]);
  const [telemetry, setTelemetry] = useState<Map<string, RobotTelemetry>>(new Map());
  const [activities, setActivities] = useState<ActivityEvent[]>([]);
  const [selectedRobotId, setSelectedRobotId] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const stats: DashboardStats = {
    activeRobots: robots.filter(r => ["delivering", "climbing", "descending", "returning"].includes(r.status)).length,
    totalRobots: robots.length,
    deliveriesToday: 47,
    successRate: 98.2,
    avgDeliveryTime: 12.5,
    stairsClimbedToday: robots.reduce((acc, r) => acc + r.stairsClimbed, 0),
    robotsCharging: robots.filter(r => r.status === "charging").length,
    pendingDeliveries: 8,
  };

  const selectedRobot = selectedRobotId 
    ? robots.find(r => r.id === selectedRobotId) || null 
    : null;

  // Simulate WebSocket connection and data updates
  useEffect(() => {
    const connect = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Simulate connection delay
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        setRobots(MOCK_ROBOTS);
        setActivities(MOCK_ACTIVITIES);
        setIsConnected(true);
        setIsLoading(false);

        // Simulate real-time updates
        intervalRef.current = setInterval(() => {
          // Update telemetry
          setTelemetry(prev => {
            const newTelemetry = new Map(prev);
            MOCK_ROBOTS.forEach(robot => {
              newTelemetry.set(robot.id, generateMockTelemetry(robot.id));
            });
            return newTelemetry;
          });

          // Randomly update robot data
          setRobots(prev => prev.map(robot => ({
            ...robot,
            batteryLevel: Math.max(0, Math.min(100, robot.batteryLevel + (Math.random() > 0.5 ? 1 : -1))),
            speed: robot.status === "charging" || robot.status === "idle" ? 0 : Math.random() * 2,
            lastSeen: new Date().toISOString(),
          })));

          // Occasionally add new activity
          if (Math.random() > 0.8) {
            const newActivity: ActivityEvent = {
              id: `evt-${Date.now()}`,
              type: ["delivery", "status", "alert", "system"][Math.floor(Math.random() * 4)] as ActivityEvent["type"],
              robotId: MOCK_ROBOTS[Math.floor(Math.random() * MOCK_ROBOTS.length)].id,
              robotName: MOCK_ROBOTS[Math.floor(Math.random() * MOCK_ROBOTS.length)].name,
              message: [
                "Package picked up successfully",
                "Navigating around obstacle",
                "Reached destination floor",
                "Battery level optimal",
                "Sensor calibration complete",
              ][Math.floor(Math.random() * 5)],
              timestamp: new Date().toISOString(),
              severity: ["info", "success", "warning"][Math.floor(Math.random() * 3)] as ActivityEvent["severity"],
            };
            setActivities(prev => [newActivity, ...prev].slice(0, 50));
          }
        }, 2000);

      } catch (err) {
        setError("Failed to connect to Stair-Doc server");
        setIsConnected(false);
        setIsLoading(false);
      }
    };

    connect();

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const selectRobot = useCallback((robotId: string | null) => {
    setSelectedRobotId(robotId);
  }, []);

  const sendEmergencyStop = useCallback(async (robotId?: string) => {
    // In production, this would send to the actual API
    console.log(`Emergency stop triggered for ${robotId || "all robots"}`);
    
    if (robotId) {
      setRobots(prev => prev.map(r => 
        r.id === robotId ? { ...r, status: "emergency" as const, speed: 0 } : r
      ));
    } else {
      setRobots(prev => prev.map(r => ({ ...r, status: "emergency" as const, speed: 0 })));
    }

    const emergencyEvent: ActivityEvent = {
      id: `evt-${Date.now()}`,
      type: "alert",
      robotId,
      robotName: robotId ? robots.find(r => r.id === robotId)?.name : undefined,
      message: robotId 
        ? `Emergency stop activated for ${robots.find(r => r.id === robotId)?.name}`
        : "EMERGENCY STOP - All robots halted",
      timestamp: new Date().toISOString(),
      severity: "error",
    };
    setActivities(prev => [emergencyEvent, ...prev]);
  }, [robots]);

  const refreshData = useCallback(() => {
    setRobots(MOCK_ROBOTS);
    setActivities(MOCK_ACTIVITIES);
  }, []);

  return {
    isConnected,
    isLoading,
    error,
    robots,
    telemetry,
    activities,
    stats,
    selectedRobot,
    selectRobot,
    sendEmergencyStop,
    refreshData,
  };
}
