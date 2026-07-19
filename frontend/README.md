# ATRQ Frontend — Architecture & Reference

> **Audience:** internal reference for the AI assistant and the developer.
> Purpose: document all architectural decisions, component roles, data flow, and conventions so we share a consistent mental model.

---

## 1. Tech Stack

| Layer | Technology | Version / Notes |
|-------|-----------|----------------|
| Framework | **React 18** | `createRoot` in `main.tsx`, functional components with hooks |
| Rendering | **PixiJS 7** | All world content rendered via PIXI canvas |
| Build | **Vite 5** + `@vitejs/plugin-react` | Fast HMR, TypeScript transpilation |
| Language | **TypeScript 5** | `strict: true`, `ES2020` target |
| Styling | **Inline styles** (React) + **PIXI Graphics** | No CSS framework; Pixi elements draw their own appearance |

### Dependencies

```json
{
  "dependencies": {
    "pixi.js": "^7.3.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "typescript": "^5.5.0",
    "vite": "^5.4.0"
  }
}
```

The dependency list is intentionally minimal. PixiJS handles all 2D rendering; React only manages the thin DOM shell and two overlay panels (`MemoryLogPanel`, `NotesPanel`).

---

## 2. Project File Structure

```
frontend/
├── index.html                  # Minimal HTML shell, mounts #root
├── package.json
├── vite.config.ts              # Proxy /ask and /check-story to backend
├── tsconfig.json               # Root references for app + node configs
├── tsconfig.app.json           # Strict TS config for src/
├── tsconfig.node.json          # Config for vite.config.ts
├── public/                     # Static assets (served as-is)
└── src/
    ├── main.tsx                # React entry: creates root, renders <App />
    ├── App.tsx                 # Top-level: renders <World />
    ├── types.ts                # Shared TS types: MemoryNodeData, MemoryNodeState
    ├── vite-env.d.ts           # Vite client type reference
    ├── assets/
    │   └── tiles/              # 5 .png tile images (tile_type_1..5.png)
    ├── camera/
    │   └── CameraController.ts # Core camera class (pan, zoom, animation)
    ├── hooks/
    │   └── useCamera.ts        # React hook wrapping CameraController lifecycle
    └── components/
        ├── World.tsx            # ⭐ Central orchestrator — owns the Pixi app
        ├── BackgroundRenderer.ts # Infinite grid OR tiled-image background
        ├── CentralNode.ts       # Animated node at world origin (0,0)
        ├── InputNode.ts         # Pixi-based text input in world-space
        ├── MemoryNode.ts        # Single memory node (circle with state)
        ├── ConnectionLines.ts   # Graph edges between memory nodes
        ├── ChatBubble.ts        # Temporary LLM response bubble
        ├── HUDLayer.ts          # Screen-space FPS + camera debug overlay
        ├── MemoryLogPanel.tsx   # React sidebar: log of all retrieved memories
        └── NotesPanel.tsx       # React sidebar: notes editor + progress check
```

---

## 3. Architecture Overview

### 3.1 Render Pipeline (Scene Graph)

```
React DOM (<div id="root">)
└── <App />                          # 100vw × 100vh container
    └── <World />                    # Orchestrator component
        ├── <div ref={wrapperRef}>   # DOM mount for PIXI canvas
        ├── Loading overlay          # Absolute-positioned "consulting…" text
        ├── Zoom controls            # Bottom-right: Grid toggle, +/-, reset
        ├── <MemoryLogPanel />       # React sidebar (left)
        └── <NotesPanel />           # React sidebar (right)

PIXI Stage (inside wrapperRef)
├── bgLayer (screen-space, static)
│   └── Graphics (solid #1a1a1a fill, resized on window resize)
├── worldLayer (camera-transformed — position & scale set by CameraController)
│   ├── BackgroundRenderer
│   │   ├── TilingSprite (tiled megatile texture, visible when grid is OFF)
│   │   └── Graphics (grid lines, redrawn each frame, visible when grid is ON)
│   ├── ConnectionLines (Graphics — redrawn from scratch on each update)
│   ├── CentralNode (Container — at 0,0; breathing + pulse/flare animations)
│   ├── InputNode (Container — Pixi text input, below central node)
│   ├── MemoryNode[] (dynamic — appended on each query response)
│   └── ChatBubble (temporary — auto-fades and self-destructs)
└── hudLayer (screen-space, not camera-transformed)
    └── HUDLayer (Container — FPS counter + camera coordinates)
```

**Key rule:** `worldLayer`'s `position` and `scale` are the camera's single source of truth (SSOT). Every world-space child inherits the camera transform automatically via Pixi's display list.

### 3.2 React vs. PixiJS Boundary

| Responsibility | React | PixiJS |
|---------------|-------|--------|
| DOM shell | `<div>` wrapper, loading overlay, zoom buttons | — |
| Sidebar panels | `MemoryLogPanel`, `NotesPanel` (state-driven React) | — |
| State for overlays | `loading`, `gridVisible`, `zoomLevel`, `memoryLog` | — |
| All world rendering | — | Stage, worldLayer, every visual element |
| Input handling | — | Keyboard events (via `window`), pointer events (via stage) |

The React component (`World.tsx`) is the **owner** of the PixiJS Application instance. It creates the app in a `useEffect`, stores refs to all Pixi objects, and cleans up on unmount. The React state is minimal — just enough to control the HTML overlays.

### 3.3 Data Flow

```
User types in InputNode (Pixi)
  → onSubmit callback fires (defined in World.tsx)
  → fetch POST /ask?query=...
  → Backend returns { contents, memories[] }
  → World.tsx:
      1. Filters new memories (prevents duplicates by mem_id)
      2. Creates MemoryNode(s) with alpha=0, adds to worldLayer
      3. Fades them in sequentially via ticker callbacks
      4. Rebuilds ConnectionLines across ALL accumulated nodes
      5. Creates ChatBubble with LLM response text
      6. Calls centralNode.flare() after 300ms
      7. Updates React state (memoryLog, loading)

User clicks a MemoryNode
  → onClick callback fires
  → Finds memory text by ID in allMemoriesRef
  → Creates/destroys ChatBubble with that text

User writes notes in NotesPanel (React)
  → Auto-saves to localStorage (debounced 300ms)
  → Can click "CHECK STORY" button
  → fetch POST /check-story with { type, progress_check_id, contents }
  → Backend returns progress_check_status (0-100)
  → Shows score bar (win ≥ 70, lose < 70)
```

### 3.4 Backend API Contract

| Endpoint | Method | Request | Response |
|----------|--------|---------|----------|
| `/ask` | POST | `?query=<encoded string>` | `{ type, contents, memories: [{ mem_id, text, x, y }] }` |
| `/check-story` | POST | JSON `{ type: 'progress_check', progress_check_id, contents }` | `{ type, progress_check_id, progress_check_status: 0-100 }` |

The Vite dev server proxies both to `localhost:8000`.

---

## 4. Component Deep-Dive

### 4.1 `World.tsx` — The Orchestrator

The most important file. It's a `forwardRef` component exposing a `WorldHandle` imperative API.

**State:**
- `gridVisible` — toggles between grid & tiled background
- `zoomLevel` — displayed in zoom reset button
- `loading` — shows/hides loading overlay
- `memoryLog` — array passed to `MemoryLogPanel`

**Refs (all Pixi objects):**
- `worldLayerRef` — the camera-transformed container
- `cameraRef` — CameraController instance
- `centralNodeRef` — CentralNode instance
- `inputRef` — InputNode instance
- `gridRef` — BackgroundRenderer instance
- `memoryNodesRef` — accumulated MemoryNode array
- `chatBubbleRef` — current ChatBubble (only one at a time)
- `allMemoriesRef` — accumulated memory payloads (for click lookup)
- `connectionLinesRef` — ConnectionLines instance

**Lifecycle (`useEffect`):**
1. Create PIXI.Application → append canvas to wrapper
2. Create layer containers (bgLayer, worldLayer, hudLayer)
3. Create all Pixi subsystems (camera, grid, connections, central node, input)
4. Set up pointer events on stage (drag, zoom, blur input)
5. Set up ticker (update grid, input, HUD, chat bubble lifecycle)
6. Set up ResizeObserver
7. Cleanup on unmount (destroy everything)

**Key patterns:**
- `askBackend` is defined inside the effect and passed to InputNode — captures all refs via closure
- New MemoryNodes are **appended** (never replace) — `allMemoriesRef` accumulates across queries
- ConnectionLines are rebuilt from scratch each time via `update()`
- ChatBubble has its own tick-based lifecycle (fade in → display → fade out → destroy)

### 4.2 `CameraController.ts` — Camera System

**Single source of truth:** `container.position = (x, y)` and `container.scale = (zoom, zoom)`.

**Drag:** 1:1 screen-pixel mapping. No division by zoom — when dragging, `dx`/`dy` from pointer are added directly to `_x`/`_y`. This means dragging feels natural regardless of zoom level.

- Dead zone of 3px² before drag activates (prevents accidental drag on click).
- Camera animation is cancelled on drag start.

**Zoom:** Cursor-centered. The world point under the cursor is computed before zoom, then the camera is repositioned so that same world point stays under the cursor after zoom. Zoom factor per wheel tick: 1.12× or 1/1.12×.

**Animation (`goTo`):** Frame-rate-independent lerp: `t = 1 - pow(1 - lerpSpeed, dt * 60)` where `lerpSpeed = 0.09`. When all axes are within threshold of their targets, animation snaps to target.

**Coordinate transforms:**
- `screenToWorld(sx, sy)` — for converting mouse position to world coords
- `worldToScreen(wx, wy)` — for overlaying DOM elements on world positions
- `getVisibleBounds()` — returns `[left, top, right, bottom]` in world coords (used by BackgroundRenderer)

**No clamping.** The camera can go anywhere — infinite canvas.

### 4.3 `BackgroundRenderer.ts` — Two Modes

**Grid mode** (default, `gridVisible = true`):
- Draws only the grid lines that fall within the visible viewport bounds.
- Minor grid: 50px spacing, color `#333333`, alpha 0.35.
- Major grid: 250px spacing, color `#4a4a4a`, alpha 0.5.
- Origin axes: subtle highlight at x=0 and y=0.
- Redrawn every frame in `update()`.

**Image mode** (`gridVisible = false`):
- Uses a `TilingSprite` with a procedurally-generated "megatile" texture.
- The megatile is a single canvas (192×192px = 12×12 tiles of 16×16 each) filled with randomly arranged tile images from `src/assets/tiles/`.
- Texture is generated once and cached in a static variable.
- Uses Vite's `import.meta.glob` to automatically pick up any `.png` in the tiles folder — **no code changes needed to add new tiles**.
- Falls back to colored rectangles if tile images haven't loaded yet.

### 4.4 `CentralNode.ts` — World Origin Marker

- Position: (0, 0) — world origin.
- Core: gray circle with inner highlight and center dot.
- **Breathing animation:** always-active subtle scale oscillation (`1 + 0.04 * sin(phase)`, ω=1.2).
- **Pulse animation:** triggered on query submit. Rapid scale-up to 1.25× over 0.3× duration, then back, fading alpha to 0.3 over 1 second.
- **Flare animation:** 0.8 second visual burst (currently just a timer placeholder — effect TBD).
- Label: `◈ CENTER` in monospace below the core.

### 4.5 `InputNode.ts` — Pixi Text Input

Fully custom text input built from PIXI primitives — no DOM `<input>` overlay.

- `WIDTH = 240`, `HEIGHT = 32`, dark background with rounded rect.
- **Focus:** triggered by pointerdown on the node. Registers `keydown` listener on `window`.
- **Blur:** triggered by pointerdown anywhere else on the stage (World.tsx calls `input.blur()` on every stage pointerdown).
- **Keyboard handling:** Enter submits → calls `onSubmit`, clears value. Backspace removes last char. Any printable key appends.
- **Caret:** blinking PIXI Graphics rect (500ms blink period), positioned after the text.
- **Placeholder:** shown when value is empty ("ask the machine...").
- **Rendering:** `renderText()` updates the PIXI.Text and hides/shows placeholder.

### 4.6 `MemoryNode.ts` — Data Points in 2D Space

- Radius: 20px.
- Three visual states: `locked` (#444), `visible` (#666), `active` (#888).
- Active state has an outer glow ring.
- Locked state draws a small lock icon.
- Label shows truncated ID (max 8 chars + ellipsis).
- Click handler: stops propagation, fires `onClick(id)` callback.
- Has a static factory `createBatch()` for convenience.

**Coordinate mapping:** Backend returns PCA coordinates (roughly ±0.35). These are scaled by `MEMORY_SCALE = 2000` to world-space positions (roughly ±700). See `World.tsx` line 4: `const MEMORY_SCALE = 2000`.

### 4.7 `ConnectionLines.ts` — Graph Edges

- Redrawn from scratch on every `update()` call.
- Each node connects to its **4 closest neighbors** (by Euclidean distance).
- Edge drawn only once per pair (lower index → higher index).
- Style: `#555577`, alpha 0.25, width 1px.
- `eventMode = 'none'` — lines don't intercept pointer events.

### 4.8 `ChatBubble.ts` — Temporary Text Display

- Appears above the central node.
- **Lifecycle:** fade in (200ms) → display (30s total lifetime) → fade out (800ms) → mark `done` → World removes and destroys it.
- During fade-out, drifts upward 0.3px/frame.
- Max width: 400px. Text is word-wrapped. Monospace font.
- Background: `#1a1a2e` at 0.92 alpha with `#8888cc` border and a small pointer arrow.

### 4.9 `HUDLayer.ts` — Debug Overlay

- Screen-space (added to `hudLayer`, not `worldLayer`).
- FPS counter (updates once per second).
- Camera position `(x, y)` and zoom level.

### 4.10 `MemoryLogPanel.tsx` — Left Sidebar (React)

- Shows all memories accumulated across queries.
- Each entry: ID#, truncated text, PCA coords + scaled world coords.
- Collapsible via a toggle button.
- Styled with inline styles — dark theme, monospace.

### 4.11 `NotesPanel.tsx` — Right Sidebar (React)

- Textarea for writing detective notes.
- **Auto-save:** debounced 300ms to `localStorage` under key `atrq_notes`.
- **Progress check:** sends notes to `/check-story`, displays score as a progress bar.
  - Score ≥ 70 → win (green), score < 70 → lose (red).
  - `progress_check_id` is auto-incremented via a ref.
- Migrates old array-format localStorage data on mount.

### 4.12 `useCamera.ts` — React Hook

- Thin wrapper: creates a `CameraController` ref, exposes `init` and `get` callbacks.
- Currently **not used** — `World.tsx` creates the camera directly. The hook exists for potential reuse.

---

## 5. Key Conventions & Patterns

### 5.1 Memory Accumulation (Not Replacement)

Each query response **adds** new memories without clearing existing ones. Duplicates are filtered by `mem_id`. This means the graph grows over time.

```typescript
const prevMemories = allMemoriesRef.current;
const prevIds = new Set(prevMemories.map((m) => m.mem_id));
const newMemories = data.memories.filter((m) => !prevIds.has(m.mem_id));
allMemoriesRef.current = [...prevMemories, ...newMemories];
```

### 5.2 Memory Coordinate Scaling

```
World coords = PCA_coord × MEMORY_SCALE (2000)
```

PCA outputs are roughly in [-0.35, 0.35]. After scaling, nodes are within ~[-700, 700] in world-space. The camera starts at zoom 0.5, so the visible area covers roughly ±viewport_size at that zoom.

### 5.3 Chat Bubble Singleton

Only one `ChatBubble` exists at a time. Creating a new one destroys the previous.

### 5.4 Fade-In Sequence

New memory nodes fade in sequentially with an 80ms staggered delay via individual ticker callbacks.

### 5.5 Stop Propagation for Input

- InputNode calls `e.stopPropagation()` on pointerdown → prevents camera drag.
- MemoryNode calls `e.stopPropagation()` on pointerdown → prevents camera drag when clicking a node.
- Stage gets pointerdown for everything else → initiates drag.

### 5.6 Resize Handling

`ResizeObserver` on the wrapper div → resizes PIXI.Application, updates camera viewport, redraws background fill.

### 5.7 Grid Toggle

`gridVisible` → sets `BackgroundRenderer.gridVisible`. When grid is OFF, the `TilingSprite` (megatile) is shown instead. Both inherit camera transform.

---

## 6. World Space Coordinate System

- **Origin:** (0, 0) — marked by CentralNode.
- **X-axis:** right = positive, left = negative.
- **Y-axis:** down = positive, up = negative (standard PixiJS convention).
- **Bounds:** theoretically infinite; practically memory nodes are within ~±35000.
- **Camera start:** center on (0, 0) at zoom 0.5.

---

## 7. Vite Configuration

```typescript
// vite.config.ts
server: {
  proxy: {
    '/ask': 'http://localhost:8000',
    '/check-story': 'http://localhost:8000',
  },
}
```

---

## 8. Potential Improvements / Known Gaps

| Area | Current State | Notes |
|------|--------------|-------|
| `useCamera` hook | Unused in World.tsx | Could refactor World to use it |
| ConnectionLines rebuild | O(n²) per `update()` | Fine for <100 nodes; could optimize with spatial index |
| ChatBubble position | Hardcoded above central node | Could anchor to clicked memory node position |
| Node labels | Just truncated IDs | Could show actual memory text or summary |
| NotesPanel | No character/word count | Could be useful for writers |
| Memory persistence | In-memory only (allMemoriesRef) | Could persist to localStorage |
| Tile loading | Requires `requestAnimationFrame` polling | Could use `Promise.all` with `Image.decode()` |
| CentralNode flare | Timer placeholder | Visual effect not yet implemented |

---

## 9. TypeScript Types

```typescript
// src/types.ts
export type MemoryNodeState = 'locked' | 'visible' | 'active';

export interface MemoryNodeData {
  id: string;
  x: number;
  y: number;
  state: MemoryNodeState;
}
```

Internal types (not exported):
- `MemoryPayload` — `{ mem_id: number; text: string; x: number; y: number }`
- `AskResponse` — `{ type: string; contents: string; memories: MemoryPayload[] }`
- `CheckResult` — `{ status: 'win' | 'lose' | null; score: number }`
- `NodePosition` — `{ id: string; x: number; y: number }` (ConnectionLines)
- `WorldHandle` — imperative API via `forwardRef`

---

## 10. Building & Running

```bash
npm run dev      # Vite dev server with HMR
npm run build    # tsc -b && vite build
npm run preview  # Serve production build locally
```