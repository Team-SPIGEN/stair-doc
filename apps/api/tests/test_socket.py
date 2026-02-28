"""Quick Socket.IO connectivity test.

Run manually against a live server:
    python tests/test_socket.py
"""
import asyncio

import pytest
import socketio


@pytest.mark.skip(reason="Manual integration test — requires a running server")
async def test():
    sio = socketio.AsyncClient()
    received = []

    @sio.on("robot_telemetry")
    async def on_telemetry(data):
        received.append(data)
        count = len(data["robots"])
        ts = data["timestamp"]
        print(f"  robot_telemetry: {count} robots at {ts}")

    @sio.on("system_health")
    async def on_health(data):
        cpu = data["cpu_usage"]
        mem = data["memory_usage"]
        lat = data["network_latency_ms"]
        print(f"  system_health: CPU={cpu}% MEM={mem}% latency={lat}ms")

    @sio.on("delivery_update")
    async def on_delivery(data):
        print(f"  delivery_update: {data['message']}")

    @sio.on("command_ack")
    async def on_ack(data):
        print(f"  command_ack: {data['action']} -> {data['status']}")

    @sio.event
    async def connect():
        print("Connected to Socket.IO server")

    print("Connecting...")
    await sio.connect(
        "http://127.0.0.1:8000",
        socketio_path="/socket.io",
        transports=["websocket"],
    )

    print("Waiting for telemetry ticks (5s)...")
    await asyncio.sleep(5)

    print("Sending emergency_stop for robot-001...")
    await sio.emit("robot_command", {"action": "emergency_stop", "robotId": "robot-001"})
    await asyncio.sleep(1)

    await sio.disconnect()
    print(f"Done. Received {len(received)} telemetry ticks.")


if __name__ == "__main__":
    asyncio.run(test())
