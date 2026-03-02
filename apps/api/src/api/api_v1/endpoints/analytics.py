"""
Analytics endpoints — deterministic mock data for stair-climbing robot metrics.

All endpoints accept a `days` query parameter (7 | 30 | 90) and return
richly realistic data shaped around the StairDoc robot scenario.
"""

import math
from datetime import date, timedelta
from fastapi import APIRouter, Query

from src.schemas.base import ApiResponse, success_response
from src.schemas.analytics import (
    BatteryAnalytics,
    DailyDataPoint,
    DailyWh,
    DeliveryAnalytics,
    DeliveryStatusBreakdown,
    FloorAnalytics,
    FloorUsage,
    HourlyRFIDPoint,
    RFIDAnalytics,
    StairClimbAnalytics,
    StairTypeBreakdown,
)

router = APIRouter(prefix="/analytics", tags=["analytics"])

# ── Deterministic helpers ─────────────────────────────────────────────────

FLOORS = ["G", "1", "2", "3", "4"]
FLOOR_BASE = {"G": 23, "1": 45, "2": 32, "3": 18, "4": 9}      # deliveries/30d
FLOOR_SUCCESS = {"G": 91.3, "1": 97.8, "2": 90.6, "3": 95.1, "4": 88.9}
FLOOR_AVG_SEC = {"G": 180, "1": 240, "2": 320, "3": 400, "4": 510}


def _dates(days: int) -> list[date]:
    today = date(2026, 3, 2)
    return [today - timedelta(days=days - 1 - i) for i in range(days)]


def _scale(days: int) -> float:
    """Scale factor for day-count vs 30-day baseline."""
    return days / 30.0


def _daily_counts(days: int, base_per_day: float) -> list[DailyDataPoint]:
    """Generate a realistic wavy daily trend using a sine curve."""
    return [
        DailyDataPoint(
            date=str(d),
            count=max(
                0,
                round(
                    base_per_day
                    * (1 + 0.3 * math.sin(i * 0.7))          # gentle wave
                    * (1 + 0.05 * math.sin(i * 2.1))          # high-freq noise
                ),
            ),
        )
        for i, d in enumerate(_dates(days))
    ]


def _daily_wh(days: int) -> list[DailyWh]:
    return [
        DailyWh(
            date=str(d),
            wh_per_delivery=round(24.0 + 2 * math.sin(i * 0.4) - 0.05 * i, 2),
            stair_wh=round(8.4 + 1.2 * math.sin(i * 0.5), 2),
        )
        for i, d in enumerate(_dates(days))
    ]


# ── Deliveries ────────────────────────────────────────────────────────────


@router.get("/deliveries", response_model=ApiResponse[DeliveryAnalytics])
async def get_delivery_analytics(
    days: int = Query(30, ge=1, le=365, description="Lookback window in days"),
) -> ApiResponse[DeliveryAnalytics]:
    """
    Delivery performance analytics.

    Includes success rate, average time, daily trend, and status breakdown.
    """
    scale = _scale(days)
    total = round(127 * scale)
    completed = round(120 * scale)
    failed = round(7 * scale)
    cancelled = round(2 * scale)
    in_transit = 3
    success_rate = round((completed / max(total, 1)) * 100, 1)
    avg_seconds = 272  # 4 min 32 s

    return success_response(
        data=DeliveryAnalytics(
            total=total,
            success_rate=success_rate,
            avg_time_seconds=avg_seconds,
            avg_time_label=f"{avg_seconds // 60} min {avg_seconds % 60} s",
            by_status=DeliveryStatusBreakdown(
                completed=completed,
                failed=failed,
                cancelled=cancelled,
                in_transit=in_transit,
            ),
            daily_trend=_daily_counts(days, 127 / 30),
        ),
        message=f"Delivery analytics for last {days} days",
    )


# ── Floors ────────────────────────────────────────────────────────────────


@router.get("/floors", response_model=ApiResponse[FloorAnalytics])
async def get_floor_analytics(
    days: int = Query(30, ge=1, le=365),
) -> ApiResponse[FloorAnalytics]:
    """
    Per-floor delivery distribution and a 2-D usage heatmap.

    Heatmap rows = floors (G → 4), columns = 6-hour time buckets (0-3).
    """
    scale = _scale(days)
    usage = [
        FloorUsage(
            floor=f,
            deliveries=round(FLOOR_BASE[f] * scale),
            success_rate=FLOOR_SUCCESS[f],
            avg_time_seconds=FLOOR_AVG_SEC[f],
        )
        for f in FLOORS
    ]

    # Normalised heatmap (0.0–1.0)
    heatmap = [
        [0.18, 0.72, 0.55, 0.30],  # G
        [0.90, 0.60, 0.85, 0.40],  # 1
        [0.70, 0.45, 0.65, 0.35],  # 2
        [0.35, 0.25, 0.40, 0.20],  # 3
        [0.15, 0.10, 0.20, 0.08],  # 4
    ]

    return success_response(
        data=FloorAnalytics(usage=usage, heatmap=heatmap),
        message=f"Floor analytics for last {days} days",
    )


# ── Battery ───────────────────────────────────────────────────────────────


@router.get("/battery", response_model=ApiResponse[BatteryAnalytics])
async def get_battery_analytics(
    days: int = Query(30, ge=1, le=365),
) -> ApiResponse[BatteryAnalytics]:
    """
    Battery efficiency metrics including stair-climb overhead.
    """
    return success_response(
        data=BatteryAnalytics(
            avg_wh_per_delivery=23.4,
            stair_overhead_pct=35.0,
            efficiency_trend=_daily_wh(days),
        ),
        message=f"Battery analytics for last {days} days",
    )


# ── Stair Climbing ────────────────────────────────────────────────────────


@router.get("/stairs", response_model=ApiResponse[StairClimbAnalytics])
async def get_stair_analytics(
    days: int = Query(30, ge=1, le=365),
) -> ApiResponse[StairClimbAnalytics]:
    """
    Stair-climbing reliability, actuator usage, and track-slip events.
    """
    scale = _scale(days)
    total = round(293 * scale)
    successful = round(275 * scale)
    failed = total - successful

    return success_response(
        data=StairClimbAnalytics(
            total_climbs=total,
            successful_climbs=successful,
            failed_climbs=failed,
            success_rate=round((successful / max(total, 1)) * 100, 1),
            avg_climbs_per_delivery=2.3,
            arm_deployments=round(342 * scale),
            track_slips=round(8 * scale),
            by_type=StairTypeBreakdown(
                standard=round(210 * scale),
                steep=round(42 * scale),
                shallow=round(30 * scale),
                worn=round(11 * scale),
            ),
            daily_trend=_daily_counts(days, 293 / 30),
        ),
        message=f"Stair analytics for last {days} days",
    )


# ── RFID ──────────────────────────────────────────────────────────────────


@router.get("/rfid", response_model=ApiResponse[RFIDAnalytics])
async def get_rfid_analytics(
    days: int = Query(30, ge=1, le=365),
) -> ApiResponse[RFIDAnalytics]:
    """
    RFID scan success/failure breakdown and hourly usage distribution.
    """
    scale = _scale(days)
    total = round(512 * scale)
    successful = round(502 * scale)
    failed = total - successful
    unauthorised = round(6 * scale)

    # Hourly distribution — peaked at 9 am and 2 pm
    def _hour_val(h: int) -> int:
        base = round(
            scale
            * (12 * math.exp(-((h - 9) ** 2) / 4) + 8 * math.exp(-((h - 14) ** 2) / 6))
        )
        return max(0, base)

    hourly = [
        HourlyRFIDPoint(
            hour=h,
            attempts=_hour_val(h),
            successes=max(0, round(_hour_val(h) * 0.982)),
        )
        for h in range(24)
    ]

    return success_response(
        data=RFIDAnalytics(
            total_scans=total,
            successful_scans=successful,
            failed_scans=failed,
            unauthorized_attempts=unauthorised,
            success_rate=round((successful / max(total, 1)) * 100, 1),
            false_positives=round(3 * scale),
            false_negatives=round(2 * scale),
            peak_hour=9,
            hourly_trend=hourly,
        ),
        message=f"RFID analytics for last {days} days",
    )


# ── Summary (all-in-one) ──────────────────────────────────────────────────


@router.get("/summary", response_model=ApiResponse[dict])
async def get_analytics_summary(
    days: int = Query(30, ge=1, le=365),
) -> ApiResponse[dict]:
    """
    Lightweight summary combining key KPIs from all analytics domains.
    Ideal for the top-row dashboard cards.
    """
    scale = _scale(days)
    total_deliveries = round(127 * scale)
    completed = round(120 * scale)

    return success_response(
        data={
            "days": days,
            "deliveries": {
                "total": total_deliveries,
                "success_rate": round((completed / max(total_deliveries, 1)) * 100, 1),
                "avg_time_label": "4 min 32 s",
            },
            "stairs": {
                "total_climbs": round(293 * scale),
                "success_rate": 93.9,
                "avg_per_delivery": 2.3,
            },
            "battery": {
                "avg_wh_per_delivery": 23.4,
                "stair_overhead_pct": 35.0,
            },
            "rfid": {
                "total_scans": round(512 * scale),
                "success_rate": 98.0,
                "unauthorized_attempts": round(6 * scale),
            },
        },
        message="Analytics summary",
    )
