# Robot Delivery Control App - Copilot Instructions

> **Single source of truth for all AI-assisted code generation in this monorepo.**

## Project Overview

This is a **robot delivery control application** built with:
- **Frontend:** Next.js 16 + React 18 + TypeScript + Tailwind CSS
- **Backend:** FastAPI + Python 3.10+ + Pydantic
- **Monorepo:** Turborepo + pnpm workspaces
- **Real-time:** Socket.IO for robot telemetry and delivery updates

---

## 1. File Structure

```
next-fast-turbo/
├── apps/
│   ├── web/                          # Next.js frontend
│   │   ├── app/                      # App Router (pages, layouts)
│   │   │   ├── (dashboard)/          # Route groups
│   │   │   ├── api/                  # API routes (if needed)
│   │   │   ├── layout.tsx            # Root layout
│   │   │   └── page.tsx              # Home page
│   │   ├── components/               # React components
│   │   │   ├── ui/                   # Primitive UI (Button, Card, Input)
│   │   │   ├── layouts/              # Layout components
│   │   │   └── features/             # Feature-specific components
│   │   │       ├── delivery/         # Delivery tracking components
│   │   │       ├── robot/            # Robot control components
│   │   │       └── rfid/             # RFID scanning components
│   │   ├── hooks/                    # Custom React hooks
│   │   ├── lib/                      # Utilities, API clients, config
│   │   │   ├── api/                  # Generated API client
│   │   │   ├── socket/               # Socket.IO client
│   │   │   └── utils.ts              # Helper functions
│   │   └── types/                    # TypeScript type definitions
│   │
│   ├── api/                          # FastAPI backend
│   │   ├── src/
│   │   │   ├── api/
│   │   │   │   ├── api_v1/
│   │   │   │   │   ├── endpoints/    # Route handlers
│   │   │   │   │   │   ├── robots.py
│   │   │   │   │   │   ├── deliveries.py
│   │   │   │   │   │   └── rfid.py
│   │   │   │   │   └── api.py        # Router aggregation
│   │   │   │   └── deps.py           # Dependencies (DB, auth)
│   │   │   ├── crud/                 # Database operations
│   │   │   ├── schemas/              # Pydantic models
│   │   │   │   ├── robot.py
│   │   │   │   ├── delivery.py
│   │   │   │   └── rfid.py
│   │   │   ├── models/               # SQLAlchemy/DB models
│   │   │   ├── core/                 # Config, security, socket
│   │   │   └── main.py               # FastAPI app entry
│   │   └── tests/                    # pytest tests
│   │
│   └── docs/                         # Mintlify documentation
│
├── packages/
│   ├── ui/                           # Shared UI components (future)
│   ├── eslint-config/                # Shared ESLint config
│   └── typescript-config/            # Shared TS config
```

---

## 2. Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| **Files (components)** | kebab-case | `robot-status-card.tsx` |
| **Files (utils)** | kebab-case | `format-delivery.ts` |
| **React Components** | PascalCase | `RobotStatusCard` |
| **Functions/Variables** | camelCase | `getRobotStatus`, `isDelivering` |
| **Constants** | SCREAMING_SNAKE | `MAX_BATTERY_LEVEL`, `API_BASE_URL` |
| **TypeScript Interfaces** | PascalCase with `I` prefix optional | `Delivery`, `RobotTelemetry` |
| **TypeScript Types** | PascalCase | `DeliveryStatus` |
| **Python files** | snake_case | `robot_status.py` |
| **Python classes** | PascalCase | `RobotStatusResponse` |
| **Python functions** | snake_case | `get_robot_status` |
| **API endpoints** | kebab-case | `/api/v1/robot-status` |
| **Socket events** | snake_case | `robot_telemetry`, `delivery_update` |
| **Database tables** | snake_case plural | `deliveries`, `robots` |
| **Environment vars** | SCREAMING_SNAKE | `SUPABASE_URL`, `API_SECRET_KEY` |

---

## 3. Code Style Rules

### 3.1 React/Next.js Components

**Always prefer Server Components.** Only add `'use client'` when you need:
- `useState`, `useEffect`, `useReducer`
- Event handlers (`onClick`, `onChange`)
- Browser APIs (`window`, `localStorage`)
- Third-party client libraries

```tsx
// ✅ Server Component (default) - apps/web/components/features/robot/robot-info.tsx
import { getRobot } from "@/lib/api/robots";

interface RobotInfoProps {
  robotId: string;
}

export async function RobotInfo({ robotId }: RobotInfoProps) {
  const robot = await getRobot(robotId);
  
  return (
    <div className="rounded-lg border bg-card p-6">
      <h2 className="text-lg font-semibold">{robot.name}</h2>
      <p className="text-muted-foreground">{robot.status}</p>
    </div>
  );
}
```

```tsx
// ✅ Client Component - apps/web/components/features/robot/robot-controls.tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useRobotSocket } from "@/hooks/use-robot-socket";

interface RobotControlsProps {
  robotId: string;
}

export function RobotControls({ robotId }: RobotControlsProps) {
  const [isMoving, setIsMoving] = useState(false);
  const { sendCommand } = useRobotSocket(robotId);

  const handleStart = async () => {
    setIsMoving(true);
    await sendCommand("start");
  };

  const handleStop = async () => {
    setIsMoving(false);
    await sendCommand("stop");
  };

  return (
    <div className="flex gap-2">
      <Button onClick={handleStart} disabled={isMoving}>
        Start Delivery
      </Button>
      <Button variant="destructive" onClick={handleStop} disabled={!isMoving}>
        Emergency Stop
      </Button>
    </div>
  );
}
```

### 3.2 Component Pattern: DashboardCard

```tsx
// apps/web/components/ui/dashboard-card.tsx
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";

interface DashboardCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon?: LucideIcon;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  className?: string;
}

export function DashboardCard({
  title,
  value,
  description,
  icon: Icon,
  trend,
  className,
}: DashboardCardProps) {
  return (
    <Card className={cn("", className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
        {trend && (
          <p
            className={cn(
              "text-xs",
              trend.isPositive ? "text-green-600" : "text-red-600"
            )}
          >
            {trend.isPositive ? "+" : "-"}{Math.abs(trend.value)}%
          </p>
        )}
      </CardContent>
    </Card>
  );
}
```

---

## 4. TypeScript Standards

### 4.1 General Rules

- **Strict mode:** Always enabled (`"strict": true`)
- **Prefer interfaces** over types for object shapes
- **Use `type` for:** unions, intersections, mapped types, primitives
- **Exhaustive checks:** Handle all union cases with `never`
- **No `any`:** Use `unknown` and narrow with type guards
- **Explicit return types:** For exported functions

### 4.2 Core Interfaces

```typescript
// apps/web/types/delivery.ts

export type DeliveryStatus = 
  | "pending"
  | "assigned"
  | "in_transit"
  | "arrived"
  | "delivered"
  | "failed"
  | "cancelled";

export interface Delivery {
  id: string;
  robotId: string;
  orderId: string;
  status: DeliveryStatus;
  pickupLocation: Location;
  dropoffLocation: Location;
  estimatedArrival: string; // ISO 8601
  actualArrival?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Location {
  latitude: number;
  longitude: number;
  address: string;
  floor?: number;
  room?: string;
}

export interface Robot {
  id: string;
  name: string;
  serialNumber: string;
  status: RobotStatus;
  batteryLevel: number; // 0-100
  currentLocation: Location;
  currentDeliveryId?: string;
  lastSeen: string;
}

export type RobotStatus = 
  | "idle"
  | "charging"
  | "delivering"
  | "returning"
  | "maintenance"
  | "offline";

export interface RFIDScan {
  id: string;
  robotId: string;
  tagId: string;
  location: Location;
  timestamp: string;
  scanType: "checkpoint" | "pickup" | "dropoff" | "obstacle";
}
```

### 4.3 Exhaustive Union Checks

```typescript
// Always handle all cases
function getStatusColor(status: DeliveryStatus): string {
  switch (status) {
    case "pending":
      return "bg-gray-500";
    case "assigned":
      return "bg-blue-500";
    case "in_transit":
      return "bg-yellow-500";
    case "arrived":
      return "bg-purple-500";
    case "delivered":
      return "bg-green-500";
    case "failed":
    case "cancelled":
      return "bg-red-500";
    default:
      // Exhaustive check - TypeScript will error if cases are missing
      const _exhaustive: never = status;
      return _exhaustive;
  }
}
```

---

## 5. API Response Format

### 5.1 Standard Response Structure

**ALL API responses must follow this format:**

```typescript
// apps/web/types/api.ts

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message: string;
  timestamp: string;
}

export interface ApiErrorResponse {
  success: false;
  data: null;
  message: string;
  timestamp: string;
  errors?: Record<string, string[]>;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: {
    items: T[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
  message: string;
  timestamp: string;
}
```

### 5.2 FastAPI Response Models

```python
# apps/api/src/schemas/base.py

from datetime import datetime
from typing import Generic, TypeVar, Optional
from pydantic import BaseModel

T = TypeVar("T")


class ApiResponse(BaseModel, Generic[T]):
    """Standard API response wrapper."""
    success: bool
    data: T
    message: str
    timestamp: datetime = datetime.utcnow()

    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class PaginatedData(BaseModel, Generic[T]):
    """Paginated data structure."""
    items: list[T]
    total: int
    page: int
    page_size: int
    total_pages: int


class PaginatedResponse(BaseModel, Generic[T]):
    """Paginated API response."""
    success: bool
    data: PaginatedData[T]
    message: str
    timestamp: datetime = datetime.utcnow()


def success_response(data: T, message: str = "Success") -> ApiResponse[T]:
    """Create a successful API response."""
    return ApiResponse(
        success=True,
        data=data,
        message=message,
        timestamp=datetime.utcnow()
    )


def error_response(message: str) -> ApiResponse[None]:
    """Create an error API response."""
    return ApiResponse(
        success=False,
        data=None,
        message=message,
        timestamp=datetime.utcnow()
    )
```

---

## 6. FastAPI Standards

### 6.1 Endpoint Pattern

```python
# apps/api/src/api/api_v1/endpoints/robots.py

from fastapi import APIRouter, Depends, HTTPException, status
from typing import Annotated

from src.api.deps import SessionDep, get_current_user
from src.schemas.robot import (
    RobotCreate,
    RobotUpdate,
    RobotResponse,
    RobotListResponse,
)
from src.schemas.base import ApiResponse, success_response, error_response
from src.crud import crud_robot
from src.models.user import User

router = APIRouter(prefix="/robots", tags=["robots"])


@router.get("", response_model=ApiResponse[list[RobotResponse]])
async def get_all_robots(
    session: SessionDep,
    skip: int = 0,
    limit: int = 100,
) -> ApiResponse[list[RobotResponse]]:
    """
    Retrieve all robots.
    
    Returns a list of all robots in the system with their current status.
    """
    robots = await crud_robot.get_multi(session, skip=skip, limit=limit)
    return success_response(
        data=[RobotResponse.model_validate(r) for r in robots],
        message=f"Retrieved {len(robots)} robots"
    )


@router.get("/{robot_id}", response_model=ApiResponse[RobotResponse])
async def get_robot(
    robot_id: str,
    session: SessionDep,
) -> ApiResponse[RobotResponse]:
    """
    Get a specific robot by ID.
    
    Args:
        robot_id: The unique identifier of the robot.
    
    Returns:
        Robot details including current status and location.
    
    Raises:
        404: Robot not found.
    """
    robot = await crud_robot.get(session, id=robot_id)
    if not robot:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Robot with id {robot_id} not found"
        )
    return success_response(
        data=RobotResponse.model_validate(robot),
        message="Robot retrieved successfully"
    )


@router.get("/{robot_id}/status", response_model=ApiResponse[RobotStatusResponse])
async def get_robot_status(
    robot_id: str,
    session: SessionDep,
) -> ApiResponse[RobotStatusResponse]:
    """
    Get real-time status of a robot.
    
    Includes battery level, current location, and active delivery info.
    """
    robot = await crud_robot.get(session, id=robot_id)
    if not robot:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Robot with id {robot_id} not found"
        )
    
    status_data = RobotStatusResponse(
        id=robot.id,
        name=robot.name,
        status=robot.status,
        battery_level=robot.battery_level,
        current_location=robot.current_location,
        current_delivery_id=robot.current_delivery_id,
        last_seen=robot.last_seen,
    )
    
    return success_response(
        data=status_data,
        message="Robot status retrieved"
    )


@router.post("/{robot_id}/command", response_model=ApiResponse[CommandResponse])
async def send_robot_command(
    robot_id: str,
    command: RobotCommand,
    session: SessionDep,
    current_user: Annotated[User, Depends(get_current_user)],
) -> ApiResponse[CommandResponse]:
    """
    Send a command to a robot.
    
    Valid commands: start, stop, pause, resume, return_to_base.
    Requires authentication.
    """
    robot = await crud_robot.get(session, id=robot_id)
    if not robot:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Robot with id {robot_id} not found"
        )
    
    # Validate command based on robot state
    if command.action == "start" and robot.status != "idle":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot start robot in {robot.status} state"
        )
    
    result = await crud_robot.execute_command(session, robot=robot, command=command)
    
    return success_response(
        data=CommandResponse(
            robot_id=robot_id,
            command=command.action,
            executed_at=datetime.utcnow(),
            status="accepted"
        ),
        message=f"Command '{command.action}' sent to robot"
    )
```

### 6.2 Pydantic Models

```python
# apps/api/src/schemas/robot.py

from datetime import datetime
from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field


class RobotStatus(str, Enum):
    IDLE = "idle"
    CHARGING = "charging"
    DELIVERING = "delivering"
    RETURNING = "returning"
    MAINTENANCE = "maintenance"
    OFFLINE = "offline"


class Location(BaseModel):
    """Geographic location with optional indoor positioning."""
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    address: str
    floor: Optional[int] = None
    room: Optional[str] = None


class RobotBase(BaseModel):
    """Base robot schema with common fields."""
    name: str = Field(..., min_length=1, max_length=100)
    serial_number: str = Field(..., pattern=r"^RBT-[A-Z0-9]{8}$")


class RobotCreate(RobotBase):
    """Schema for creating a new robot."""
    initial_location: Location


class RobotUpdate(BaseModel):
    """Schema for updating a robot (all fields optional)."""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    status: Optional[RobotStatus] = None
    current_location: Optional[Location] = None


class RobotResponse(RobotBase):
    """Schema for robot API responses."""
    id: str
    status: RobotStatus
    battery_level: int = Field(..., ge=0, le=100)
    current_location: Location
    current_delivery_id: Optional[str] = None
    last_seen: datetime
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class RobotStatusResponse(BaseModel):
    """Lightweight status response for real-time updates."""
    id: str
    name: str
    status: RobotStatus
    battery_level: int
    current_location: Location
    current_delivery_id: Optional[str]
    last_seen: datetime


class RobotCommand(BaseModel):
    """Command to send to a robot."""
    action: str = Field(..., pattern=r"^(start|stop|pause|resume|return_to_base)$")
    parameters: Optional[dict] = None


class CommandResponse(BaseModel):
    """Response after sending a command."""
    robot_id: str
    command: str
    executed_at: datetime
    status: str = Field(..., pattern=r"^(accepted|rejected|pending)$")
```

---

## 7. Error Handling

### 7.1 Frontend Error Handling

```tsx
// apps/web/lib/api/client.ts

import { ApiResponse, ApiErrorResponse } from "@/types/api";
import { toast } from "sonner";

export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public errors?: Record<string, string[]>
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiRequest<T>(
  url: string,
  options?: RequestInit
): Promise<T> {
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });

    const data: ApiResponse<T> | ApiErrorResponse = await response.json();

    if (!response.ok || !data.success) {
      throw new ApiError(
        data.message || "An error occurred",
        response.status,
        "errors" in data ? data.errors : undefined
      );
    }

    return data.data;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(
      error instanceof Error ? error.message : "Network error",
      0
    );
  }
}
```

```tsx
// apps/web/components/features/robot/robot-controls.tsx
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { sendRobotCommand } from "@/lib/api/robots";
import { ApiError } from "@/lib/api/client";

export function RobotControls({ robotId }: { robotId: string }) {
  const [isLoading, setIsLoading] = useState(false);

  const handleCommand = async (command: string) => {
    setIsLoading(true);
    try {
      await sendRobotCommand(robotId, command);
      toast.success(`Command '${command}' sent successfully`);
    } catch (error) {
      if (error instanceof ApiError) {
        toast.error(error.message);
        if (error.errors) {
          Object.entries(error.errors).forEach(([field, messages]) => {
            messages.forEach((msg) => toast.error(`${field}: ${msg}`));
          });
        }
      } else {
        toast.error("Failed to send command. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button onClick={() => handleCommand("start")} disabled={isLoading}>
      {isLoading ? "Sending..." : "Start Delivery"}
    </Button>
  );
}
```

### 7.2 Error Boundary

```tsx
// apps/web/components/error-boundary.tsx
"use client";

import { Component, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Error caught by boundary:", error, errorInfo);
    // TODO: Send to error tracking service
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center gap-4 p-8">
          <AlertTriangle className="h-12 w-12 text-destructive" />
          <h2 className="text-lg font-semibold">Something went wrong</h2>
          <p className="text-muted-foreground text-center max-w-md">
            {this.state.error?.message || "An unexpected error occurred"}
          </p>
          <Button onClick={() => this.setState({ hasError: false })}>
            Try Again
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
```

### 7.3 Backend Error Handling

```python
# apps/api/src/api/api_v1/endpoints/error_handlers.py

from fastapi import Request, status
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from datetime import datetime


async def validation_exception_handler(
    request: Request,
    exc: RequestValidationError
) -> JSONResponse:
    """Handle Pydantic validation errors."""
    errors = {}
    for error in exc.errors():
        field = ".".join(str(loc) for loc in error["loc"])
        if field not in errors:
            errors[field] = []
        errors[field].append(error["msg"])

    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "success": False,
            "data": None,
            "message": "Validation error",
            "timestamp": datetime.utcnow().isoformat(),
            "errors": errors,
        },
    )


async def generic_exception_handler(
    request: Request,
    exc: Exception
) -> JSONResponse:
    """Handle unexpected errors."""
    # Log the error for debugging
    print(f"Unexpected error: {exc}")
    
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "success": False,
            "data": None,
            "message": "Internal server error",
            "timestamp": datetime.utcnow().isoformat(),
        },
    )
```

---

## 8. Socket.IO Events

### 8.1 Event Names and Payloads

| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `robot_telemetry` | Server → Client | `RobotTelemetry` | Real-time robot position/battery |
| `rfid_scan` | Server → Client | `RFIDScanEvent` | RFID tag scanned by robot |
| `delivery_update` | Server → Client | `DeliveryUpdate` | Delivery status changed |
| `robot_command` | Client → Server | `RobotCommand` | Send command to robot |
| `subscribe_robot` | Client → Server | `{ robotId: string }` | Subscribe to robot updates |
| `unsubscribe_robot` | Client → Server | `{ robotId: string }` | Unsubscribe from robot |

### 8.2 TypeScript Event Types

```typescript
// apps/web/types/socket.ts

export interface RobotTelemetry {
  robotId: string;
  timestamp: string;
  location: {
    latitude: number;
    longitude: number;
    heading: number; // degrees
    speed: number; // m/s
  };
  battery: {
    level: number;
    isCharging: boolean;
    estimatedMinutesRemaining: number;
  };
  sensors: {
    obstacleDetected: boolean;
    distanceToObstacle?: number;
  };
}

export interface RFIDScanEvent {
  robotId: string;
  tagId: string;
  timestamp: string;
  location: Location;
  scanType: "checkpoint" | "pickup" | "dropoff" | "obstacle";
  deliveryId?: string;
}

export interface DeliveryUpdate {
  deliveryId: string;
  robotId: string;
  previousStatus: DeliveryStatus;
  newStatus: DeliveryStatus;
  timestamp: string;
  estimatedArrival?: string;
  location?: Location;
}

export interface SocketEventMap {
  robot_telemetry: RobotTelemetry;
  rfid_scan: RFIDScanEvent;
  delivery_update: DeliveryUpdate;
  robot_command: RobotCommand;
  subscribe_robot: { robotId: string };
  unsubscribe_robot: { robotId: string };
}
```

### 8.3 Socket.IO Hook

```tsx
// apps/web/hooks/use-robot-socket.ts
"use client";

import { useEffect, useCallback, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { RobotTelemetry, RFIDScanEvent, DeliveryUpdate } from "@/types/socket";

interface UseRobotSocketOptions {
  onTelemetry?: (data: RobotTelemetry) => void;
  onRFIDScan?: (data: RFIDScanEvent) => void;
  onDeliveryUpdate?: (data: DeliveryUpdate) => void;
  autoConnect?: boolean;
}

interface UseRobotSocketReturn {
  isConnected: boolean;
  telemetry: RobotTelemetry | null;
  sendCommand: (command: string, params?: Record<string, unknown>) => void;
  subscribe: () => void;
  unsubscribe: () => void;
}

export function useRobotSocket(
  robotId: string,
  options: UseRobotSocketOptions = {}
): UseRobotSocketReturn {
  const {
    onTelemetry,
    onRFIDScan,
    onDeliveryUpdate,
    autoConnect = true,
  } = options;

  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [telemetry, setTelemetry] = useState<RobotTelemetry | null>(null);

  // Initialize socket connection
  useEffect(() => {
    if (!autoConnect) return;

    const socket = io(process.env.NEXT_PUBLIC_SOCKET_URL!, {
      transports: ["websocket"],
      autoConnect: true,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setIsConnected(true);
      socket.emit("subscribe_robot", { robotId });
    });

    socket.on("disconnect", () => {
      setIsConnected(false);
    });

    socket.on("robot_telemetry", (data: RobotTelemetry) => {
      if (data.robotId === robotId) {
        setTelemetry(data);
        onTelemetry?.(data);
      }
    });

    socket.on("rfid_scan", (data: RFIDScanEvent) => {
      if (data.robotId === robotId) {
        onRFIDScan?.(data);
      }
    });

    socket.on("delivery_update", (data: DeliveryUpdate) => {
      if (data.robotId === robotId) {
        onDeliveryUpdate?.(data);
      }
    });

    return () => {
      socket.emit("unsubscribe_robot", { robotId });
      socket.disconnect();
    };
  }, [robotId, autoConnect, onTelemetry, onRFIDScan, onDeliveryUpdate]);

  const sendCommand = useCallback(
    (command: string, params?: Record<string, unknown>) => {
      if (socketRef.current?.connected) {
        socketRef.current.emit("robot_command", {
          robotId,
          action: command,
          parameters: params,
        });
      }
    },
    [robotId]
  );

  const subscribe = useCallback(() => {
    socketRef.current?.emit("subscribe_robot", { robotId });
  }, [robotId]);

  const unsubscribe = useCallback(() => {
    socketRef.current?.emit("unsubscribe_robot", { robotId });
  }, [robotId]);

  return {
    isConnected,
    telemetry,
    sendCommand,
    subscribe,
    unsubscribe,
  };
}
```

### 8.4 Usage Example

```tsx
// apps/web/components/features/robot/robot-live-view.tsx
"use client";

import { useRobotSocket } from "@/hooks/use-robot-socket";
import { toast } from "sonner";
import { DashboardCard } from "@/components/ui/dashboard-card";
import { Battery, MapPin, Wifi, WifiOff } from "lucide-react";

interface RobotLiveViewProps {
  robotId: string;
}

export function RobotLiveView({ robotId }: RobotLiveViewProps) {
  const { isConnected, telemetry } = useRobotSocket(robotId, {
    onRFIDScan: (scan) => {
      toast.info(`RFID scanned: ${scan.tagId} (${scan.scanType})`);
    },
    onDeliveryUpdate: (update) => {
      toast.success(`Delivery ${update.deliveryId}: ${update.newStatus}`);
    },
  });

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <DashboardCard
        title="Connection"
        value={isConnected ? "Online" : "Offline"}
        icon={isConnected ? Wifi : WifiOff}
        className={isConnected ? "" : "border-destructive"}
      />
      <DashboardCard
        title="Battery"
        value={telemetry ? `${telemetry.battery.level}%` : "—"}
        description={telemetry?.battery.isCharging ? "Charging" : undefined}
        icon={Battery}
      />
      <DashboardCard
        title="Speed"
        value={telemetry ? `${telemetry.location.speed.toFixed(1)} m/s` : "—"}
        icon={MapPin}
      />
    </div>
  );
}
```

---

## 9. Tailwind CSS Standards

### 9.1 Spacing Scale

Use consistent spacing values:

```
p-1 = 4px    p-2 = 8px    p-3 = 12px   p-4 = 16px
p-5 = 20px   p-6 = 24px   p-8 = 32px   p-10 = 40px
```

**Standard component spacing:**
- Card padding: `p-4` or `p-6`
- Section margins: `mb-6` or `mb-8`
- Flex gaps: `gap-2`, `gap-4`, `gap-6`
- Grid gaps: `gap-4`, `gap-6`

### 9.2 Color Usage

Use semantic color tokens from shadcn/ui:

```tsx
// ✅ Correct - semantic colors
<div className="bg-background text-foreground" />
<div className="bg-card text-card-foreground" />
<div className="bg-primary text-primary-foreground" />
<div className="bg-destructive text-destructive-foreground" />
<p className="text-muted-foreground" />
<div className="border-border" />

// ❌ Avoid - hard-coded colors (unless intentional brand colors)
<div className="bg-white text-black" />
<div className="bg-blue-500" />
```

### 9.3 Responsive Prefixes

Mobile-first approach:

```tsx
// Grid: 1 column on mobile, 2 on tablet, 4 on desktop
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">

// Padding: smaller on mobile, larger on desktop
<div className="p-4 md:p-6 lg:p-8">

// Text: smaller on mobile, larger on desktop
<h1 className="text-2xl md:text-3xl lg:text-4xl font-bold">

// Hide/show at breakpoints
<div className="hidden md:block">  {/* Hidden on mobile */}
<div className="block md:hidden">  {/* Visible only on mobile */}
```

### 9.4 Button Variants

```tsx
// apps/web/components/ui/button.tsx (extend shadcn/ui)

// Primary action
<Button>Start Delivery</Button>

// Secondary action
<Button variant="secondary">View Details</Button>

// Destructive action
<Button variant="destructive">Emergency Stop</Button>

// Outline for less emphasis
<Button variant="outline">Cancel</Button>

// Ghost for toolbar/minimal UI
<Button variant="ghost" size="icon">
  <Settings className="h-4 w-4" />
</Button>

// Link style
<Button variant="link">Learn more</Button>

// Loading state
<Button disabled>
  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
  Processing...
</Button>

// With icon
<Button>
  <Plus className="mr-2 h-4 w-4" />
  Add Robot
</Button>

// Size variants
<Button size="sm">Small</Button>
<Button size="default">Default</Button>
<Button size="lg">Large</Button>
<Button size="icon"><X className="h-4 w-4" /></Button>
```

---

## 10. Testing Standards

### 10.1 Frontend Testing (Vitest + Testing Library)

```tsx
// apps/web/__tests__/components/dashboard-card.test.tsx

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DashboardCard } from "@/components/ui/dashboard-card";
import { Battery } from "lucide-react";

describe("DashboardCard", () => {
  it("renders title and value", () => {
    render(<DashboardCard title="Battery" value="85%" />);
    
    expect(screen.getByText("Battery")).toBeInTheDocument();
    expect(screen.getByText("85%")).toBeInTheDocument();
  });

  it("renders optional description", () => {
    render(
      <DashboardCard
        title="Battery"
        value="85%"
        description="Charging"
      />
    );
    
    expect(screen.getByText("Charging")).toBeInTheDocument();
  });

  it("renders trend indicator with correct color", () => {
    render(
      <DashboardCard
        title="Deliveries"
        value="142"
        trend={{ value: 12, isPositive: true }}
      />
    );
    
    const trend = screen.getByText("+12%");
    expect(trend).toHaveClass("text-green-600");
  });

  it("renders icon when provided", () => {
    render(
      <DashboardCard
        title="Battery"
        value="85%"
        icon={Battery}
      />
    );
    
    // Icon is rendered (check by svg presence)
    expect(document.querySelector("svg")).toBeInTheDocument();
  });
});
```

### 10.2 Backend Testing (pytest)

```python
# apps/api/tests/test_robots.py

import pytest
from httpx import AsyncClient
from datetime import datetime

from src.main import app
from src.schemas.robot import RobotStatus


@pytest.fixture
def sample_robot():
    return {
        "name": "DeliveryBot-001",
        "serial_number": "RBT-ABC12345",
        "initial_location": {
            "latitude": 37.7749,
            "longitude": -122.4194,
            "address": "123 Main St",
        },
    }


@pytest.mark.asyncio
async def test_get_robots_empty():
    """Test getting robots when none exist."""
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.get("/api/v1/robots")
    
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert isinstance(data["data"], list)
    assert "timestamp" in data


@pytest.mark.asyncio
async def test_create_robot(sample_robot):
    """Test creating a new robot."""
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.post("/api/v1/robots", json=sample_robot)
    
    assert response.status_code == 201
    data = response.json()
    assert data["success"] is True
    assert data["data"]["name"] == sample_robot["name"]
    assert data["data"]["status"] == RobotStatus.IDLE


@pytest.mark.asyncio
async def test_create_robot_invalid_serial():
    """Test creating robot with invalid serial number."""
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.post("/api/v1/robots", json={
            "name": "Test Bot",
            "serial_number": "INVALID",  # Should match RBT-XXXXXXXX
            "initial_location": {
                "latitude": 0,
                "longitude": 0,
                "address": "Test",
            },
        })
    
    assert response.status_code == 422
    data = response.json()
    assert data["success"] is False
    assert "serial_number" in data.get("errors", {})


@pytest.mark.asyncio
async def test_robot_command_invalid_state():
    """Test sending start command to non-idle robot."""
    # First create a robot and set it to delivering state
    # Then try to send start command - should fail
    pass  # Implementation depends on test fixtures
```

---

## 11. Git Commit Standards

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Formatting (no code change)
- `refactor`: Code restructure (no feature/fix)
- `perf`: Performance improvement
- `test`: Adding tests
- `chore`: Build/tooling changes

**Scopes:**
- `web`: Frontend app
- `api`: Backend app
- `ui`: Shared UI components
- `socket`: Real-time features
- `deps`: Dependencies

**Examples:**
```
feat(api): add robot telemetry endpoint

Implement GET /api/v1/robots/{id}/telemetry for real-time status.
Includes battery level, location, and sensor data.

Closes #123
```

```
fix(web): prevent duplicate socket subscriptions

Add cleanup in useRobotSocket hook to unsubscribe on unmount.
Fixes memory leak when rapidly switching between robot views.

Fixes #456
```

---

## 12. Environment Variables

### 12.1 Frontend (.env.local)

```env
# API
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_SOCKET_URL=http://localhost:8000

# Feature flags
NEXT_PUBLIC_ENABLE_TELEMETRY=true
NEXT_PUBLIC_ENABLE_RFID=true
```

### 12.2 Backend (.env)

```env
# Server
API_HOST=0.0.0.0
API_PORT=8000
DEBUG=true

# Database (Supabase)
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-key

# Security
SECRET_KEY=your-secret-key-min-32-chars
CORS_ORIGINS=http://localhost:3000

# Robot Communication
ROBOT_MQTT_BROKER=mqtt://localhost:1883
ROBOT_MQTT_TOPIC_PREFIX=robots/
```

---

## Quick Reference

### Creating a New Feature

1. **Types first:** Add interfaces to `apps/web/types/` and `apps/api/src/schemas/`
2. **API endpoint:** Create route in `apps/api/src/api/api_v1/endpoints/`
3. **CRUD operations:** Add to `apps/api/src/crud/`
4. **Frontend API:** Update generated client or add to `apps/web/lib/api/`
5. **Components:** Build in `apps/web/components/features/<feature>/`
6. **Socket events:** If real-time, add to socket types and hooks
7. **Tests:** Add tests for both frontend and backend

### Common Patterns

```tsx
// Server Component with data fetching
export default async function Page() {
  const data = await fetchData();
  return <ClientComponent initialData={data} />;
}

// Client Component with state
"use client";
export function ClientComponent({ initialData }) {
  const [data, setData] = useState(initialData);
  // ...
}

// API route handler
export async function GET(request: Request) {
  // ...
}
```

---

**Last Updated:** February 2026  
**Maintainers:** Robot Delivery Team
