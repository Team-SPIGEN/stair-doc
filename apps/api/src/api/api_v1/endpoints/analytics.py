"""
Analytics endpoints — returns empty metrics until real data is recorded.
"""

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

FLOORS = ["G", "1", "2", "3", "4"]


def _dates(days: int) -> list[date]:
    today = date.today()
    return [today - timedelta(days=days - 1 - i) for i in range(days)]


def _empty_daily_counts(days: int) -> list[DailyDataPoint]:
    return [DailyDataPoint(date=str(d), count=0) for d in _dates(days)]


def _empty_daily_wh(days: int) -> list[DailyWh]:
    return [
        DailyWh(date=str(d), wh_per_delivery=0.0, stair_wh=0.0) for d in _dates(days)
    ]


@router.get("/deliveries", response_model=ApiResponse[DeliveryAnalytics])
async def get_delivery_analytics(
    days: int = Query(30, ge=1, le=365, description="Lookback window in days"),
) -> ApiResponse[DeliveryAnalytics]:
    return success_response(
        data=DeliveryAnalytics(
            total=0,
            success_rate=0.0,
            avg_time_seconds=0,
            avg_time_label="0 min 0 s",
            by_status=DeliveryStatusBreakdown(
                completed=0, failed=0, cancelled=0, in_transit=0
            ),
            daily_trend=_empty_daily_counts(days),
        ),
        message=f"Delivery analytics for last {days} days",
    )


@router.get("/floors", response_model=ApiResponse[FloorAnalytics])
async def get_floor_analytics(
    days: int = Query(30, ge=1, le=365),
) -> ApiResponse[FloorAnalytics]:
    return success_response(
        data=FloorAnalytics(
            usage=[
                FloorUsage(
                    floor=f,
                    deliveries=0,
                    success_rate=0.0,
                    avg_time_seconds=0,
                )
                for f in FLOORS
            ],
            heatmap=[[0.0] * 4 for _ in FLOORS],
        ),
        message=f"Floor analytics for last {days} days",
    )


@router.get("/battery", response_model=ApiResponse[BatteryAnalytics])
async def get_battery_analytics(
    days: int = Query(30, ge=1, le=365),
) -> ApiResponse[BatteryAnalytics]:
    return success_response(
        data=BatteryAnalytics(
            avg_wh_per_delivery=0.0,
            stair_overhead_pct=0.0,
            efficiency_trend=_empty_daily_wh(days),
        ),
        message=f"Battery analytics for last {days} days",
    )


@router.get("/stairs", response_model=ApiResponse[StairClimbAnalytics])
async def get_stair_analytics(
    days: int = Query(30, ge=1, le=365),
) -> ApiResponse[StairClimbAnalytics]:
    return success_response(
        data=StairClimbAnalytics(
            total_climbs=0,
            successful_climbs=0,
            failed_climbs=0,
            success_rate=0.0,
            avg_climbs_per_delivery=0.0,
            arm_deployments=0,
            track_slips=0,
            by_type=StairTypeBreakdown(
                standard=0, steep=0, shallow=0, worn=0
            ),
            daily_trend=_empty_daily_counts(days),
        ),
        message=f"Stair analytics for last {days} days",
    )


@router.get("/rfid", response_model=ApiResponse[RFIDAnalytics])
async def get_rfid_analytics(
    days: int = Query(30, ge=1, le=365),
) -> ApiResponse[RFIDAnalytics]:
    hourly = [
        HourlyRFIDPoint(hour=h, attempts=0, successes=0) for h in range(24)
    ]
    return success_response(
        data=RFIDAnalytics(
            total_scans=0,
            successful_scans=0,
            failed_scans=0,
            unauthorized_attempts=0,
            success_rate=0.0,
            false_positives=0,
            false_negatives=0,
            peak_hour=0,
            hourly_trend=hourly,
        ),
        message=f"RFID analytics for last {days} days",
    )


@router.get("/summary", response_model=ApiResponse[dict])
async def get_analytics_summary(
    days: int = Query(30, ge=1, le=365),
) -> ApiResponse[dict]:
    return success_response(
        data={
            "days": days,
            "deliveries": {
                "total": 0,
                "success_rate": 0.0,
                "avg_time_label": "0 min 0 s",
            },
            "stairs": {
                "total_climbs": 0,
                "success_rate": 0.0,
                "avg_per_delivery": 0.0,
            },
            "battery": {
                "avg_wh_per_delivery": 0.0,
                "stair_overhead_pct": 0.0,
            },
            "rfid": {
                "total_scans": 0,
                "success_rate": 0.0,
                "unauthorized_attempts": 0,
            },
        },
        message="Analytics summary",
    )
