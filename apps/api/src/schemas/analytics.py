"""
Pydantic schemas for the Analytics API.
"""

from pydantic import BaseModel


# ── Shared ─────────────────────────────────────────────────────────────────


class DailyDataPoint(BaseModel):
    date: str          # ISO 8601 date string, e.g. "2026-02-28"
    count: int


class DailyWh(BaseModel):
    date: str
    wh_per_delivery: float
    stair_wh: float    # overhead attributable to stair climbs


# ── Deliveries ────────────────────────────────────────────────────────────


class DeliveryStatusBreakdown(BaseModel):
    completed: int
    failed: int
    cancelled: int
    in_transit: int


class DeliveryAnalytics(BaseModel):
    total: int
    success_rate: float                # 0-100
    avg_time_seconds: int              # average door-to-door seconds
    avg_time_label: str                # human-readable, e.g. "4 min 32 s"
    by_status: DeliveryStatusBreakdown
    daily_trend: list[DailyDataPoint]


# ── Floors ────────────────────────────────────────────────────────────────


class FloorUsage(BaseModel):
    floor: str                         # "G", "1", "2", "3", "4"
    deliveries: int
    success_rate: float
    avg_time_seconds: int


class FloorAnalytics(BaseModel):
    usage: list[FloorUsage]
    # 2-D heat matrix: rows = floor (G→4), cols = hour buckets (0-23 down-sampled)
    heatmap: list[list[float]]


# ── Battery ───────────────────────────────────────────────────────────────


class BatteryAnalytics(BaseModel):
    avg_wh_per_delivery: float
    stair_overhead_pct: float          # e.g. 35.0  → "+35% per floor change"
    efficiency_trend: list[DailyWh]


# ── Stair Climbing ────────────────────────────────────────────────────────


class StairTypeBreakdown(BaseModel):
    standard: int
    steep: int
    shallow: int
    worn: int


class StairClimbAnalytics(BaseModel):
    total_climbs: int
    successful_climbs: int
    failed_climbs: int
    success_rate: float
    avg_climbs_per_delivery: float
    arm_deployments: int               # total MG995 actuator cycles
    track_slips: int
    by_type: StairTypeBreakdown
    daily_trend: list[DailyDataPoint]


# ── RFID ──────────────────────────────────────────────────────────────────


class HourlyRFIDPoint(BaseModel):
    hour: int          # 0-23
    attempts: int
    successes: int


class RFIDAnalytics(BaseModel):
    total_scans: int
    successful_scans: int
    failed_scans: int
    unauthorized_attempts: int
    success_rate: float
    false_positives: int
    false_negatives: int
    peak_hour: int
    hourly_trend: list[HourlyRFIDPoint]
