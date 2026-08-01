# Graph Report - stair-doc  (2026-08-01)

## Corpus Check
- 229 files · ~107,782 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2163 nodes · 3958 edges · 158 communities (122 shown, 36 thin omitted)
- Extraction: 93% EXTRACTED · 7% INFERRED · 0% AMBIGUOUS · INFERRED: 290 edges (avg confidence: 0.76)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `dffd764c`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- workbox-5194662c.js
- storage.py
- request.ts
- test_deliveries.py
- process_voice_command
- register
- analytics.ts
- photo-gallery.tsx
- cn
- devDependencies
- test_auth.py
- bridge.py
- overrides
- ros2_bridge.py
- utils.ts
- use-navigation-socket.ts
- test_camera.py
- notifications.py
- use-install-prompt.ts
- page.tsx
- test_rfid.py
- mint.json
- page.tsx
- use-voice-commands.ts
- socket.py
- deliveries.ts
- robot.py
- test_navigation.py
- compilerOptions
- devDependencies
- compilerOptions
- camera.py
- bridge.py
- include
- _client
- locations.py
- page.tsx
- getSocket
- navigation.py
- analytics.py
- delivery.py
- get_field
- auth-context.tsx
- analytics.py
- Example: Adding a new delivery status endpoint
- Running Stair-Doc locally
- manifest.json
- camera.py
- AsyncClient
- _assert_envelope
- components.json
- form.tsx
- compilerOptions
- success_response
- base.py
- layout.tsx
- dependencies
- package.json
- auth-aware-layout.tsx
- vercel.json
- normalize_tag_id
- register_bridge
- system-health.tsx
- Sidebar.tsx
- Stair-Doc Hardware Integration Guide
- nextjs.mdx
- README.md
- devDependencies
- build_bridge_command_payload
- dashboard.ts
- config.py
- docs.mdx
- introduction.mdx
- useOnlineStatus
- proxy.ts
- generate-icons.mjs
- package.json
- scripts
- package.json
- 🤖 Robot Pi Integration
- package.json
- vercel.json
- deployment.mdx
- twConfig.ts
- Step 4 — Verify the connection
- 🚀 Quick Start
- nav.tsx
- Stair-Doc — Copilot Instructions
- start_ros2_bridge.sh
- bridge_pose
- Socket.IO protocol reference
- Destination autonomous navigation (Nav2 / micro-ROS)
- Step 3 — Update Raspberry Pi code
- 📦 Deployment
- test_socket.py
- next.config.js
- Environment variables
- stop_ros2_bridge.sh
- library.js
- next.js
- react-internal.js
- tsconfig.json
- robot.py
- turbo.mdx
- eslint.config.mjs
- AuthApiError
- next-env.d.ts
- axios
- class-variance-authority
- clsx
- form-data
- framer-motion
- hamburger-react
- @hookform/resolvers
- lucide-react
- next
- next-themes
- nipplejs
- @radix-ui/react-icons
- @radix-ui/react-separator
- @radix-ui/react-slot
- @radix-ui/react-tooltip
- react-use
- sonner
- tailwind-merge
- tailwindcss-animate
- tailwindcss-text-fill
- workbox-window
- zod
- install_service.sh
- README.md
- api

## God Nodes (most connected - your core abstractions)
1. `cn()` - 85 edges
2. `success_response()` - 45 edges
3. `overrides` - 43 edges
4. `_reset_state()` - 32 edges
5. `Button` - 27 edges
6. `Card` - 23 edges
7. `CardContent` - 23 edges
8. `_assert_envelope()` - 22 edges
9. `CardHeader` - 22 edges
10. `CardTitle` - 21 edges

## Surprising Connections (you probably didn't know these)
- `list_streams()` --calls--> `success_response()`  [INFERRED]
  apps/api/src/api/api_v1/endpoints/camera.py → apps/api/src/schemas/base.py
- `get_delivery_analytics()` --calls--> `success_response()`  [INFERRED]
  apps/api/src/api/api_v1/endpoints/analytics.py → apps/api/src/schemas/base.py
- `get_floor_analytics()` --calls--> `success_response()`  [INFERRED]
  apps/api/src/api/api_v1/endpoints/analytics.py → apps/api/src/schemas/base.py
- `get_battery_analytics()` --calls--> `success_response()`  [INFERRED]
  apps/api/src/api/api_v1/endpoints/analytics.py → apps/api/src/schemas/base.py
- `get_stair_analytics()` --calls--> `success_response()`  [INFERRED]
  apps/api/src/api/api_v1/endpoints/analytics.py → apps/api/src/schemas/base.py

## Import Cycles
- 2-file cycle: `apps/web/components/dashboard/index.ts -> apps/web/components/dashboard/stairdoc-dashboard.tsx -> apps/web/components/dashboard/index.ts`
- 3-file cycle: `apps/web/components/layouts/dashboard/layout-components/Header/Header.tsx -> apps/web/components/layouts/dashboard/layout-components/index.ts -> apps/web/components/layouts/dashboard/layout-components/Header/index.ts -> apps/web/components/layouts/dashboard/layout-components/Header/Header.tsx`

## Communities (158 total, 36 thin omitted)

### Community 0 - "workbox-5194662c.js"
Cohesion: 0.05
Nodes (27): RFIDAnalyticsChart(), LidarViz(), a, b(), constructor(), deleteCacheAndMetadata(), et, F (+19 more)

### Community 1 - "storage.py"
Cohesion: 0.07
Nodes (62): authorize_rfid(), authorize_scan(), get_rfid_logs(), list_registered_tags(), _load_tag(), RFID management endpoints for Stair-Doc.  Provides RFID tag authorization (conta, Ensure the three physical demo tags are available after restarts., Authorize a scan and persist the access log. (+54 more)

### Community 2 - "request.ts"
Cohesion: 0.06
Nodes (42): ApiError, ApiRequestOptions, ApiResult, CancelablePromise, CancelError, OnCancel, Headers, OpenAPI (+34 more)

### Community 3 - "test_deliveries.py"
Cohesion: 0.09
Nodes (31): _create_delivery(), AsyncClient, Tests for the delivery management endpoints.  All responses follow the ApiRespon, GET /api/v1/deliveries/{id} returns the correct delivery in envelope., GET /api/v1/deliveries/{id} returns 404 for non-existent delivery., GET /api/v1/deliveries?sort=asc returns oldest first., PATCH /api/v1/deliveries/{id} updates the status., PATCH /api/v1/deliveries/{id} can update multiple fields at once. (+23 more)

### Community 4 - "process_voice_command"
Cohesion: 0.09
Nodes (30): _emit_voice_activity(), _extract_floor(), _extract_recipient(), get_supported_commands(), _is_allowed(), _parse_voice_text(), process_voice_command(), Voice command endpoint with simple NLP + action dispatch.  Parses raw transcript (+22 more)

### Community 5 - "register"
Cohesion: 0.05
Nodes (48): login(), me(), Authentication endpoints – register, login, me.  All responses follow the ``ApiR, Authenticate with email + password, receive a JWT., Return the authenticated user's profile., Convert an internal mock-user dict into a ``UserResponse``., Register a new user (admin-only).      Creates a mock user and returns a JWT tok, register() (+40 more)

### Community 6 - "analytics.ts"
Cohesion: 0.06
Nodes (49): AnalyticsContent(), BatteryTrendChart(), formatDate(), Props, DateRangePicker(), OPTIONS, Props, DeliveryTrendChart() (+41 more)

### Community 7 - "photo-gallery.tsx"
Cohesion: 0.09
Nodes (31): UploadPanel(), CameraViewer(), QUALITY_PRESETS, StreamPlaceholder(), StreamQuality, DateRangePreset, formatBytes(), formatDate() (+23 more)

### Community 8 - "cn"
Cohesion: 0.08
Nodes (39): ToggleRow(), DeliverySuccessGauge(), Props, StatusRow(), ActivityFeed(), ActivityFeedProps, BatteryGauge(), BatteryGaugeCircular() (+31 more)

### Community 9 - "devDependencies"
Cohesion: 0.04
Nodes (46): devDependencies, autoprefixer, eslint, eslint-config-next, eslint-config-turbo, @next/eslint-plugin-next, openapi-typescript-codegen, postcss (+38 more)

### Community 10 - "test_auth.py"
Cohesion: 0.09
Nodes (43): _assert_envelope(), _auth_header(), _login(), AsyncClient, Tests for the authentication endpoints.  Covers login, register (admin-only), /m, Invalid password returns 401., Non-existent email returns 401., Missing required fields returns 422. (+35 more)

### Community 11 - "bridge.py"
Cohesion: 0.10
Nodes (25): _acquire_pid_lock(), BridgeState, build_telemetry_payload(), _candidate_api_urls(), choose_api_url(), Esp32Link, Esp32State, _is_lock_phrase() (+17 more)

### Community 12 - "overrides"
Cohesion: 0.05
Nodes (43): @babel/helpers@<7.26.10, @babel/runtime@<7.26.10, body-parser@<1.20.3, brace-expansion@>=1.0.0 <=1.1.11, brace-expansion@>=2.0.0 <=2.0.1, braces@<3.0.3, cookie@<0.7.0, cross-spawn@>=7.0.0 <7.0.5 (+35 more)

### Community 13 - "ros2_bridge.py"
Cohesion: 0.08
Nodes (41): AbstractEventLoop, _acquire_pid_lock(), _amcl_callback(), bridge_command(), _cancel_nav_goal(), _check_micro_ros_agent(), connect(), disconnect() (+33 more)

### Community 14 - "utils.ts"
Cohesion: 0.13
Nodes (36): send_command(), switch_mode(), arm_autonomous(), assert_can_autonomous(), assert_can_enter_mode(), assert_can_manual(), autonomous_reject_message(), clear_emergency() (+28 more)

### Community 15 - "use-navigation-socket.ts"
Cohesion: 0.11
Nodes (18): Joystick(), JoystickProps, ApiError, apiFetch(), ApiResponse, AutonomousRequest, AutonomousResponse, CommandResponse (+10 more)

### Community 16 - "test_camera.py"
Cohesion: 0.05
Nodes (37): Tests for the Camera Feed endpoints.  All responses follow the ApiResponse envel, Fetching an uploaded photo returns correct data., Requesting a non-existent photo returns 404., Uploading a photo via multipart form data returns metadata., After uploading, the new photo shows up in the gallery list., Listing camera streams returns info for each robot., Get stream info for a specific robot., Listing photos without filters returns seeded records. (+29 more)

### Community 17 - "notifications.py"
Cohesion: 0.09
Nodes (34): _get_vapid_claims(), _get_vapid_private_key(), _get_vapid_public_key(), ApiResponse, Push notification endpoints.  Provides:   GET  /notifications/vapid-public-key, Return the server VAPID public key.      The frontend uses this to subscribe to, Register a browser push subscription.      The client should call this once afte, Remove a push subscription by endpoint URL. (+26 more)

### Community 18 - "use-install-prompt.ts"
Cohesion: 0.14
Nodes (13): **/.env, .env.local, ^lint, NODE_ENV, cache, persistent, globalDependencies, globalEnv (+5 more)

### Community 19 - "page.tsx"
Cohesion: 0.10
Nodes (30): RFIDPage(), StatCard(), GlobalEmergencyStop(), RFIDScanner(), RFIDScannerProps, ScanPhase, formatTimestamp(), getScanTypeBadge() (+22 more)

### Community 20 - "test_rfid.py"
Cohesion: 0.11
Nodes (30): _auth_header(), _login(), AsyncClient, Tests for the RFID management endpoints.  All responses follow the ApiResponse e, After authorization, a new entry should appear in the access logs., GET /api/v1/rfid/logs returns seeded logs in envelope., Filter logs by scan type., Filter logs by authorization result. (+22 more)

### Community 21 - "mint.json"
Cohesion: 0.07
Nodes (29): anchors, api, baseUrl, maintainOrder, dark, light, colors, background (+21 more)

### Community 22 - "page.tsx"
Cohesion: 0.12
Nodes (35): KpiCard(), AutonomousNavigationPage(), ManualNavigationPage(), NavigationHubPage(), RoleGate(), LidarMapPanel(), LidarMapPanelProps, ConnectionBadges() (+27 more)

### Community 23 - "use-voice-commands.ts"
Cohesion: 0.12
Nodes (25): VoiceControlProps, getSpeechImpl(), pickNaturalVoice(), SpeechRecognition, SpeechRecognitionConstructor, SpeechRecognitionErrorEvent, SpeechRecognitionEvent, useVoiceCommands() (+17 more)

### Community 24 - "socket.py"
Cohesion: 0.13
Nodes (17): _build_nav_status_payload(), _build_system_health_payload(), camera_snapshot(), camera_stream_toggle(), connect(), Any, Socket.IO server for real-time robot telemetry.  Emits `robot_telemetry` events, Build system_health event payload. (+9 more)

### Community 25 - "deliveries.ts"
Cohesion: 0.10
Nodes (28): DeliveriesPage(), DeliveryFilters(), DeliveryFiltersProps, DeliveryForm(), DeliveryFormProps, DeliveryTable(), DeliveryTableProps, formatLocation() (+20 more)

### Community 26 - "robot.py"
Cohesion: 0.20
Nodes (13): _build_robot_response(), get_all_robot_status(), get_robot_status(), Robot status endpoints for Stair-Doc delivery robots., BatteryResponse, LocationResponse, BaseModel, Robot battery information. (+5 more)

### Community 27 - "test_navigation.py"
Cohesion: 0.06
Nodes (74): Register a Pi bridge client for a robot., register_bridge(), _assert_envelope(), AsyncClient, Tests for the Navigation Control endpoints.  All responses follow the ApiRespons, Sending 'stop' resets speed to 0., Emergency stop sets mode to emergency and speed to 0., Commands other than emergency_stop are blocked when emergency is active. (+66 more)

### Community 28 - "compilerOptions"
Cohesion: 0.08
Nodes (24): compilerOptions, allowJs, declaration, declarationMap, incremental, jsx, lib, module (+16 more)

### Community 29 - "devDependencies"
Cohesion: 0.09
Nodes (22): eslint-config-prettier, eslint-plugin-only-warn, devDependencies, eslint-config-prettier, eslint-config-turbo, eslint-plugin-only-warn, typescript, @typescript-eslint/eslint-plugin (+14 more)

### Community 30 - "compilerOptions"
Cohesion: 0.09
Nodes (22): compilerOptions, allowImportingTsExtensions, composite, declaration, declarationMap, esModuleInterop, forceConsistentCasingInFileNames, inlineSources (+14 more)

### Community 31 - "camera.py"
Cohesion: 0.13
Nodes (21): get_photo(), get_photo_image(), get_photo_thumbnail(), get_stream_info(), list_photos(), list_streams(), mjpeg_stream_proxy(), datetime (+13 more)

### Community 32 - "bridge.py"
Cohesion: 0.18
Nodes (17): get_slam_map_endpoint(), get_bridge_connection_status(), get_bridge_last_seen(), get_bridge_lidar(), get_bridge_map(), get_bridge_status(), get_robot_pose(), get_slam_map() (+9 more)

### Community 33 - "include"
Cohesion: 0.09
Nodes (21): compilerOptions, baseUrl, paths, plugins, sourceMap, exclude, extends, include (+13 more)

### Community 34 - "_client"
Cohesion: 0.14
Nodes (22): _client(), AsyncClient, Floor 5 exceeds the 1-4 range; expect 400., Return home' should navigate robot to floor 1 / base station., Clear shared nav mode so voice navigate tests start from idle., Delivery to Alice' should create a delivery for recipient Alice., With confirm=True, emergency stop should execute immediately., GET /api/v1/voice/commands must return a non-empty command list. (+14 more)

### Community 35 - "locations.py"
Cohesion: 0.17
Nodes (18): get_locations(), find_location(), list_locations(), _load_file(), load_locations(), LocationRoom, locations_file_path(), normalize_destination() (+10 more)

### Community 36 - "page.tsx"
Cohesion: 0.11
Nodes (22): AutonomousRequest, AutonomousResponse, LidarPoint, ManualCommandRequest, ModeSwitchRequest, NavGoalPose, NavigationCommand, NavigationMode (+14 more)

### Community 37 - "getSocket"
Cohesion: 0.09
Nodes (28): DashboardPage(), DOT_COLOR, LocationMapProps, RING_COLOR, RobotStatusCardProps, LidarVizProps, CommandAckPayload, EmergencyActivePayload (+20 more)

### Community 38 - "navigation.py"
Cohesion: 0.25
Nodes (7): APIRoute, custom_generate_unique_id(), get_application(), lifespan(), Generates a custom ID when using the TypeScript Generator Client      Args:, Application lifespan – start background tasks on startup., FastAPI

### Community 39 - "analytics.py"
Cohesion: 0.16
Nodes (17): _dates(), _empty_daily_counts(), _empty_daily_wh(), get_analytics_summary(), get_battery_analytics(), get_delivery_analytics(), get_stair_analytics(), ApiResponse (+9 more)

### Community 40 - "delivery.py"
Cohesion: 0.16
Nodes (17): create_delivery(), DeliveryCreate, DeliveryListResponse, DeliveryLocation, DeliveryResponse, DeliveryStatus, Priority, BaseModel (+9 more)

### Community 41 - "get_field"
Cohesion: 0.20
Nodes (11): get_field(), Any, Store the latest SLAM occupancy grid snapshot from the ros2_bridge relay.      E, Read a field accepting snake_case or camelCase keys., store_slam_map(), Subscribe to a specific robot's updates (room-based)., Unsubscribe from a specific robot's updates., Ingest a SLAM OccupancyGrid snapshot from the ros2_bridge relay.      Expected p (+3 more)

### Community 42 - "auth-context.tsx"
Cohesion: 0.05
Nodes (48): AuthPage(), LoginForm(), RegisterForm(), SettingsPage(), RoleGateProps, Icons, Header(), normalizePathname() (+40 more)

### Community 43 - "analytics.py"
Cohesion: 0.19
Nodes (15): get_floor_analytics(), get_rfid_analytics(), BatteryAnalytics, DailyDataPoint, DailyWh, DeliveryAnalytics, FloorAnalytics, FloorUsage (+7 more)

### Community 44 - "Example: Adding a new delivery status endpoint"
Cohesion: 0.12
Nodes (15): Adding your own endpoints, API endpoints, API structure, Dependencies, Example: Adding a new delivery status endpoint, Introduction, Python 3.10+, Root directory (+7 more)

### Community 45 - "Running Stair-Doc locally"
Cohesion: 0.12
Nodes (15): Introduction, Next Steps, Open the workspace, Optional: Extensions, Running Stair-Doc locally, Step 1: Local setup, Step 2: Python setup, Step 2: Running tasks (+7 more)

### Community 46 - "manifest.json"
Cohesion: 0.12
Nodes (15): background_color, categories, description, display, icons, lang, name, orientation (+7 more)

### Community 47 - "camera.py"
Cohesion: 0.18
Nodes (14): CameraSource, CameraStreamInfo, PhotoListResponse, PhotoType, PhotoUploadMeta, BaseModel, Enum, str (+6 more)

### Community 48 - "AsyncClient"
Cohesion: 0.15
Nodes (18): _assert_ros_bridge_ready(), _broadcast_nav_status(), _estimate_eta(), _forward_to_bridge(), get_nav_status(), Any, datetime, Navigation control endpoints for Stair-Doc.  Manual joystick → Socket.IO → ros2_ (+10 more)

### Community 49 - "_assert_envelope"
Cohesion: 0.16
Nodes (14): clear_bridge_map(), clear_slam_map(), get_bridge_sid(), Store the latest robot world-frame pose from /amcl_pose or /odom., store_robot_pose(), bridge_pose(), _forward_to_bridge(), _motor_controller_ready() (+6 more)

### Community 50 - "components.json"
Cohesion: 0.14
Nodes (13): aliases, components, utils, rsc, $schema, style, tailwind, baseColor (+5 more)

### Community 51 - "form.tsx"
Cohesion: 0.14
Nodes (12): FormControl, FormDescription, FormFieldContext, FormFieldContextValue, FormItem, FormItemContext, FormItemContextValue, FormLabel (+4 more)

### Community 52 - "compilerOptions"
Cohesion: 0.14
Nodes (13): compilerOptions, jsx, lib, module, noEmit, target, display, extends (+5 more)

### Community 53 - "success_response"
Cohesion: 0.19
Nodes (12): delete_photo(), delete_delivery(), get_delivery(), list_deliveries(), Delivery management endpoints for Stair-Doc.  Provides CRUD operations for the d, update_delivery(), Build a successful envelope dict that FastAPI will serialise., success_response() (+4 more)

### Community 54 - "base.py"
Cohesion: 0.22
Nodes (12): ApiErrorResponse, ApiResponse, CreateBase, error_response(), InDBBase, BaseModel, Shared schema primitives for the Stair-Doc API.  Provides the standard ``ApiResp, Standard API response wrapper.      Every endpoint returns ``{ success, data, me (+4 more)

### Community 55 - "layout.tsx"
Cohesion: 0.28
Nodes (6): fontSans, metadata, RootLayout(), viewport, InstallPromptBanner(), ThemeProvider()

### Community 56 - "dependencies"
Cohesion: 0.15
Nodes (13): dependencies, @ducanh2912/next-pwa, @radix-ui/react-label, react-dom, react-hook-form, recharts, socket.io-client, @ducanh2912/next-pwa (+5 more)

### Community 57 - "package.json"
Cohesion: 0.17
Nodes (11): dependencies, mintlify, @mintlify/scraping, name, scripts, dev, generate-api, generate-api:dev (+3 more)

### Community 58 - "auth-aware-layout.tsx"
Cohesion: 0.25
Nodes (4): AuthAwareLayout(), DashboardLayout(), DashboardLayoutProps, Footer()

### Community 59 - "vercel.json"
Cohesion: 0.18
Nodes (10): buildCommand, env, NEXT_PUBLIC_API_URL, NEXT_PUBLIC_SOCKET_URL, NEXT_PUBLIC_VAPID_PUBLIC_KEY, framework, headers, installCommand (+2 more)

### Community 60 - "normalize_tag_id"
Cohesion: 0.22
Nodes (8): build_bridge_command_payload(), normalize_tag_id(), Build the command payload forwarded to ros2_bridge (Socket.IO).      UART ``bt_c, Normalize RFID UIDs from hardware (numeric or prefixed) to app format., Unit tests for robot bridge helpers., test_build_bridge_command_payload(), test_normalize_tag_id_numeric(), test_normalize_tag_id_prefixed()

### Community 61 - "register_bridge"
Cohesion: 0.22
Nodes (12): apply_bridge_telemetry(), Merge a bridge telemetry payload into the in-memory robot state., _build_telemetry_payload(), Build a robot_telemetry event payload (JSON-safe dict)., LockStatus, Enum, str, Container lock status. (+4 more)

### Community 62 - "system-health.tsx"
Cohesion: 0.27
Nodes (10): formatUptime(), ServiceRow(), ServiceStatus, statusColor(), statusIcon(), SystemHealth(), SystemHealthProps, UsageBar() (+2 more)

### Community 63 - "Sidebar.tsx"
Cohesion: 0.31
Nodes (9): _find_pgm(), get_static_map(), _pgm_to_png_b64(), Any, Path, Map endpoints for Stair-Doc.  Provides:   GET /api/v1/map/slam    — latest live, Read a PGM (P5 binary or P2 ASCII) and return (base64-PNG, width, height)., Return resolution + origin from the .yaml sidecar file if available. (+1 more)

### Community 64 - "Stair-Doc Hardware Integration Guide"
Cohesion: 0.18
Nodes (11): App → Backend (existing), Architecture, Backend → Pi (listen), ESP32 ↔ Pi physical connection, LIDAR / mapping, Pi → Backend (emit), Quick start checklist, Socket.IO protocol reference (+3 more)

### Community 65 - "nextjs.mdx"
Cohesion: 0.22
Nodes (8): App, App structure, Components, How to generate TypeScript, Introduction, Lib, TypeScript from FastAPI, Using the generated API client

### Community 66 - "README.md"
Cohesion: 0.22
Nodes (7): 🏗 Architecture, ✨ Features, ⌨️ Keyboard Shortcuts, 📄 License, 📊 Lighthouse Targets, Monorepo Structure, 🧪 Testing

### Community 67 - "devDependencies"
Cohesion: 0.22
Nodes (9): devDependencies, prettier, @repo/eslint-config, @repo/typescript-config, turbo, @repo/eslint-config, @repo/typescript-config, turbo (+1 more)

### Community 68 - "build_bridge_command_payload"
Cohesion: 0.21
Nodes (8): InstallPageClient(), metadata, BeforeInstallPromptEvent, detectInstalled(), detectIOS(), InstallState, useInstallPrompt(), UseInstallPromptReturn

### Community 69 - "dashboard.ts"
Cohesion: 0.25
Nodes (7): DashboardStats, Delivery, DeliveryStatus, Location, Robot, RobotStatus, RobotTelemetry

### Community 70 - "config.py"
Cohesion: 0.28
Nodes (5): Fail fast when production starts with insecure demo defaults., Settings, _split_csv(), validate_production_settings(), BaseSettings

### Community 71 - "docs.mdx"
Cohesion: 0.29
Nodes (6): Creating API endpoint documentation, Docs structure, Generating OpenAPI schema, Introduction, Step 1: Generate MDX, Step 2: Update mint.json

### Community 72 - "introduction.mdx"
Cohesion: 0.29
Nodes (6): Core Delivery Workflow, Getting Started, Key Features, Tech Stack, User Roles, What is Stair-Doc?

### Community 73 - "useOnlineStatus"
Cohesion: 0.52
Nodes (5): OfflineIndicator(), getServerSnapshot(), getSnapshot(), subscribe(), useOnlineStatus()

### Community 74 - "proxy.ts"
Cohesion: 0.43
Nodes (6): config, decodePayload(), normalizePathname(), proxy(), PUBLIC_PATHS, ROLE_ROUTES

### Community 75 - "generate-icons.mjs"
Cohesion: 0.29
Nodes (5): appleSvg, __dirname, maskableSvg, OUT, sizes

### Community 76 - "package.json"
Cohesion: 0.29
Nodes (6): engines, node, name, packageManager, pnpm, private

### Community 77 - "scripts"
Cohesion: 0.29
Nodes (7): scripts, build, dev, dev:all, dev:docs, format, lint

### Community 78 - "package.json"
Cohesion: 0.29
Nodes (6): license, name, private, publishConfig, access, version

### Community 79 - "🤖 Robot Pi Integration"
Cohesion: 0.22
Nodes (9): Destination autonomous navigation, Manual drive via `/cmd_vel` (same ROS stack), Operator note — one stack for Manual + Auto, Quick start, RFID RC522 (SPI), 🤖 Robot Pi Integration, Socket.IO events, UART ESP motor bridge — disabled (evidence) (+1 more)

### Community 80 - "package.json"
Cohesion: 0.33
Nodes (5): name, scripts, dev, generate:requirements, version

### Community 81 - "vercel.json"
Cohesion: 0.33
Nodes (5): builds, env, APP_MODULE, routes, version

### Community 82 - "deployment.mdx"
Cohesion: 0.33
Nodes (5): Backend Deployment (Railway), Documentation Deployment (Mintlify), Frontend Deployment (Vercel), Overview, Prerequisites

### Community 83 - "twConfig.ts"
Cohesion: 0.33
Nodes (4): fullTwConfig, TailwindCustomColours, twColourConfig, { fontFamily }

### Community 84 - "Step 4 — Verify the connection"
Cohesion: 0.33
Nodes (6): 1. Bridge registration, 2. Live telemetry in PWA, 3. Navigation controls, 4. RFID unlock, 5. Emergency stop, Step 4 — Verify the connection

### Community 85 - "🚀 Quick Start"
Cohesion: 0.33
Nodes (6): Backend (`apps/api`), Frontend (`apps/web`), Full monorepo dev, Install, Prerequisites, 🚀 Quick Start

### Community 86 - "nav.tsx"
Cohesion: 0.25
Nodes (8): Build a pseudo-LIDAR scan from ultrasonic distances (cm → metres)., store_bridge_lidar(), ultrasonic_to_lidar(), bridge_lidar(), bridge_telemetry(), Ingest live telemetry from the Pi bridge., Ingest LIDAR / ultrasonic scan points from the Pi bridge., test_ultrasonic_to_lidar()

### Community 87 - "Stair-Doc — Copilot Instructions"
Cohesion: 0.40
Nodes (4): Architecture, Conventions, Key paths, Stair-Doc — Copilot Instructions

### Community 88 - "start_ros2_bridge.sh"
Cohesion: 0.60
Nodes (3): err(), log(), start_ros2_bridge.sh script

### Community 89 - "bridge_pose"
Cohesion: 0.33
Nodes (6): get_robot(), get_robots(), Any, Shared in-memory state for the single Stair-Doc robot., bridge_register(), Register a Raspberry Pi bridge client for a robot.

### Community 91 - "Socket.IO protocol reference"
Cohesion: 0.20
Nodes (8): metadata, ^build, dist/**, .next/**, !.next/cache/**, dependsOn, outputs, build

### Community 92 - "Destination autonomous navigation (Nav2 / micro-ROS)"
Cohesion: 0.50
Nodes (4): Destination autonomous navigation (Nav2 / micro-ROS), Flow, Mode separation, Prerequisites on the Pi

### Community 93 - "Step 3 — Update Raspberry Pi code"
Cohesion: 0.50
Nodes (4): Step 3 — Update Raspberry Pi code, Voice commands (Pi Vosk — optional), What changed from your original Pi script, Your RFID tags are pre-registered

### Community 94 - "📦 Deployment"
Cohesion: 0.50
Nodes (4): Backend → Railway, 📦 Deployment, Frontend → Vercel, VAPID Key Generation

### Community 97 - "Environment variables"
Cohesion: 0.67
Nodes (3): Backend (`apps/api/.env`), Environment variables, Pi (`hardware/raspberry-pi/.env`)

### Community 107 - "AuthApiError"
Cohesion: 0.67
Nodes (3): Backend (FastAPI), Frontend (PWA), Step 1 — Deploy / run the application

## Knowledge Gaps
- **523 isolated node(s):** `name`, `version`, `dev`, `generate:requirements`, `api` (+518 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **36 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `cn()` connect `cn` to `workbox-5194662c.js`, `getSocket`, `analytics.ts`, `photo-gallery.tsx`, `auth-context.tsx`, `page.tsx`, `form.tsx`, `page.tsx`, `layout.tsx`, `deliveries.ts`, `system-health.tsx`?**
  _High betweenness centrality (0.059) - this node is a cross-community bridge._
- **Why does `dependencies` connect `dependencies` to `tailwindcss-text-fill`, `workbox-window`, `zod`, `devDependencies`, `form.tsx`, `axios`, `class-variance-authority`, `clsx`, `form-data`, `framer-motion`, `hamburger-react`, `@hookform/resolvers`, `lucide-react`, `next`, `next-themes`, `nipplejs`, `@radix-ui/react-icons`, `@radix-ui/react-separator`, `@radix-ui/react-slot`, `@radix-ui/react-tooltip`, `react-use`, `sonner`, `tailwind-merge`, `tailwindcss-animate`?**
  _High betweenness centrality (0.049) - this node is a cross-community bridge._
- **Are the 42 inferred relationships involving `success_response()` (e.g. with `get_analytics_summary()` and `get_battery_analytics()`) actually correct?**
  _`success_response()` has 42 INFERRED edges - model-reasoned connections that need verification._
- **What connects `name`, `version`, `dev` to the rest of the system?**
  _832 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `workbox-5194662c.js` be split into smaller, more focused modules?**
  _Cohesion score 0.05422838031533684 - nodes in this community are weakly interconnected._
- **Should `storage.py` be split into smaller, more focused modules?**
  _Cohesion score 0.07115384615384615 - nodes in this community are weakly interconnected._
- **Should `request.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05888376856118792 - nodes in this community are weakly interconnected._