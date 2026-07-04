# Stair-Doc — Copilot Instructions

Single stair-climbing delivery robot (`robot-001`). Monorepo: `apps/web` (Next.js PWA), `apps/api` (FastAPI + Socket.IO), `hardware/` (Pi bridge + ESP32).

## Architecture

- Live telemetry: Raspberry Pi runs `hardware/raspberry-pi/bridge.py` → Socket.IO `bridge_telemetry`
- REST API: in-memory stores for deliveries, RFID, camera photos (no DB yet)
- Auth: JWT + in-memory users in `apps/api/src/core/auth.py`
- Robot state: `apps/api/src/core/robot_state.py` (single robot)

## Conventions

- Web: TypeScript, `@/` imports, shadcn/ui, `ROBOT_ID` from `apps/web/lib/robot.ts`
- API: Pydantic schemas in `src/schemas/`, endpoints in `src/api/api_v1/endpoints/`
- Do not add multi-robot mock data or template URLs (`next-fast-turbo`)

## Key paths

- Socket events: `apps/api/src/core/socket.py`
- Pi integration: `hardware/INTEGRATION.md`
- Local dev: `pnpm dev` (web + api), API at `http://localhost:8000`
