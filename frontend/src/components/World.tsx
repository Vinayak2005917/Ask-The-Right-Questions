import { useEffect, useRef, useState, useImperativeHandle, forwardRef, useCallback } from 'react';
import * as PIXI from 'pixi.js';
import { CameraController } from '../camera/CameraController';
import { MemoryNode, preloadMemoryNodeTexture } from './MemoryNode';
import { CentralNode } from './CentralNode';
import { BackgroundRenderer } from './BackgroundRenderer';
import { InputNode } from './InputNode';
import { HUDLayer } from './HUDLayer';
import { ChatBubble } from './ChatBubble';
import { ConnectionLines } from './ConnectionLines';
import { NotesPanel } from './NotesPanel';
import { MemoryLogPanel } from './MemoryLogPanel';
import { LightManager } from '../lights/LightManager';
import { PointLight } from '../lights/PointLight';
import { FloorLight } from '../lights/FloorLight';
import { DustNoise } from '../lights/DustNoise';
import { DustParticles } from './DustParticles';

// ── Global pixel-art defaults (applied before any texture is created) ─────
PIXI.BaseTexture.defaultOptions.scaleMode = PIXI.SCALE_MODES.NEAREST;

interface MemoryPayload {
  mem_id: number;
  text: string;
  x: number;
  y: number;
}

interface WorldNodeData {
  id: number;
  text: string;
  x: number;
  y: number;
  connections: number[];
}

interface AskResponse {
  type: string;
  contents: string;
  memories: MemoryPayload[];
}

export interface WorldHandle {
  addToWorld: (child: PIXI.DisplayObject) => void;
  removeFromWorld: (child: PIXI.DisplayObject) => void;
  resetCamera: () => void;
  centralNode: CentralNode;
}

interface WorldProps {
  width?: number;
  height?: number;
}

/**
 * Scene graph:
 *   Stage
 *   ├── Background Layer  (screen-space fill)
 *   ├── World Layer       (transformed by camera)
 *   │     ├── BackgroundRenderer (infinite grid)
 *   │     ├── Darkness Overlay
 *   │     ├── DustParticles     (ambient floating dust)
 *   │     ├── FloorLight[]       (∼95 % dead fluorescent fixtures)
 *   │     ├── LightManager       (additive-blended glows)
 *   │     │     ├─ ambient glow (very faint, large radius)
 *   │     │     ├─ central node glow
 *   │     │     └─ memory node glows
 *   │     ├── ConnectionLines    (glowing nearest-neighbour edges)
 *   │     ├── CentralNode
 *   │     ├── InputNode
 *   │     ├── MemoryNode[]   (dynamic — rebuilt on each query)
 *   │     └── ChatBubble     (appears temporarily)
 *   └── HUD Layer         (screen-space)
 *         ├── HUDLayer
 *         └── DustNoise       (animated noise, screen-space)
 */
export const World = forwardRef<WorldHandle, WorldProps>(
  ({ width = 800, height = 600 }, ref) => {
    const wrapperRef = useRef<HTMLDivElement>(null);
    const worldLayerRef = useRef<PIXI.Container | null>(null);
    const cameraRef = useRef<CameraController | null>(null);
    const centralNodeRef = useRef<CentralNode | null>(null);
    const inputRef = useRef<InputNode | null>(null);
    const gridRef = useRef<BackgroundRenderer | null>(null);
    const memoryNodesRef = useRef<MemoryNode[]>([]);
    const chatBubbleRef = useRef<ChatBubble | null>(null);
    const allMemoriesRef = useRef<MemoryPayload[]>([]);
    const lightManagerRef = useRef<LightManager | null>(null);
    const memoryLightRefs = useRef<PointLight[]>([]);
    const centralLightRef = useRef<PointLight | null>(null);
    const floorLightRef = useRef<FloorLight[]>([]);
    const dustNoiseRef = useRef<DustNoise | null>(null);
    const dustParticlesRef = useRef<DustParticles | null>(null);
    const connectionLinesRef = useRef<ConnectionLines | null>(null);
    const memoryScaleRef = useRef(2.5);
    const rebuildConnectionsRef = useRef<() => void>(() => {});
    const unlockNodesRef = useRef<(ids: number[]) => void>(() => {});
    const loadAllWorldDataRef = useRef<() => Promise<void>>(async () => {});
    const mountedRef = useRef(true);
    const abortRef = useRef<AbortController | null>(null);
    const mountCountRef = useRef(0);
    // ── World data from /send-all ──────────────────────
    const allWorldNodesRef = useRef<Map<number, WorldNodeData>>(new Map());
    const unlockedIdsRef = useRef<Set<number>>(new Set());
    // ── Track which MemoryNode/light corresponds to which world id ──
    const nodeByIdRef = useRef<Map<number, MemoryNode>>(new Map());
    const lightByIdRef = useRef<Map<number, PointLight>>(new Map());
    const fadingLightsRef = useRef<Map<PointLight, number>>(new Map());
    const animQueueRef = useRef<number[]>([]);
    const animatingRef = useRef<Set<number>>(new Set());
    const [unlockedCount, setUnlockedCount] = useState(0);
    const totalNodeCountRef = useRef(0);
    const [gridVisible, setGridVisible] = useState(false);
    const [zoomLevel, setZoomLevel] = useState(1.5);
    const [loading, setLoading] = useState(false);
    const [memoryLog, setMemoryLog] = useState<MemoryPayload[]>([]);
    const [allWorldLog, setAllWorldLog] = useState<WorldNodeData[]>([]);
    const [tileScale, setTileScale] = useState(3);
    const [memoryScale, setMemoryScale] = useState(2.5);
    const [darkFreq, setDarkFreq] = useState(12); // 0–50%
    const [nodeScale, setNodeScale] = useState(3);
    const [notesOpen, setNotesOpen] = useState(true);
    const [centralScale, setCentralScale] = useState(0.15);

    useEffect(() => {
      const mountId = ++mountCountRef.current;
      mountedRef.current = true;
      console.log(`[World] mount #${mountId}`);
      const wrapper = wrapperRef.current;
      if (!wrapper) return;

      const initW = wrapper.offsetWidth || width;
      const initH = wrapper.offsetHeight || height;

      // ── Pixi Application ──────────────────────────────
      const app = new PIXI.Application({
        width: initW,
        height: initH,
        backgroundColor: 0x1a1a1a,
        antialias: false,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      });
      const canvas = app.view as HTMLCanvasElement;
      canvas.style.imageRendering = 'pixelated';
      wrapper.appendChild(canvas);

      // ── Layers (created fresh each mount) ─────────────
      const bgLayer = new PIXI.Container();
      const worldLayer = new PIXI.Container();
      const hudLayer = new PIXI.Container();
      worldLayerRef.current = worldLayer;
      app.stage.addChild(bgLayer, worldLayer, hudLayer);

      // Mutable hitArea rectangle to avoid recreating on resize
      const hitArea = new PIXI.Rectangle(0, 0, initW, initH);

      // Stage gets the full-screen hitArea (not worldLayer — it is camera-transformed)
      app.stage.eventMode = 'static';
      app.stage.hitArea = hitArea;

      // Screen-space background fill
      const bgFill = new PIXI.Graphics();
      bgFill.beginFill(0x1a1a1a);
      bgFill.drawRect(0, 0, initW, initH);
      bgFill.endFill();
      bgLayer.addChild(bgFill);

      // ── Camera ────────────────────────────────────────
      const camera = new CameraController(worldLayer, {
        viewWidth: initW,
        viewHeight: initH,
        minZoom: 0.5,
        maxZoom: 5,
        panBounds: { left: -10000, top: -10000, right: 10000, bottom: 10000 },
      });
      cameraRef.current = camera;

      // ── Background (infinite grid / tiled image, in world layer) ────
      const grid = new BackgroundRenderer();
      grid.gridVisible = gridVisible;
      gridRef.current = grid;
      worldLayer.addChild(grid);

      // ── Darkness overlay (above background, below gameplay) ──────
      const darknessOverlay = new PIXI.Graphics();
      darknessOverlay.beginFill(0x050510);
      darknessOverlay.drawRect(-15000, -15000, 30000, 30000);
      darknessOverlay.endFill();
      darknessOverlay.alpha = 0.75;
      worldLayer.addChild(darknessOverlay);

      // ── Dust particles (ambient floating dust, above bg but below gameplay) ─
      const dustParticles = new DustParticles();
      dustParticlesRef.current = dustParticles;
      worldLayer.addChild(dustParticles);

      // ── Floor lights (dead fluorescent fixtures) ─────────────────
      const floorLights: FloorLight[] = [];
      const spacing = 600;
      const halfWorld = 5000;
      for (let row = -halfWorld + spacing / 2; row < halfWorld; row += spacing) {
        for (let col = -halfWorld + spacing / 2; col < halfWorld; col += spacing) {
          const fl = new FloorLight();
          fl.x = col + (Math.random() - 0.5) * spacing * 0.5;
          fl.y = row + (Math.random() - 0.5) * spacing * 0.5;
          worldLayer.addChild(fl);
          floorLights.push(fl);
        }
      }
      floorLightRef.current = floorLights;

      // ── Light Manager (additive-blended glows behind everything else) ──
      const lightManager = new LightManager();
      lightManagerRef.current = lightManager;
      worldLayer.addChild(lightManager);

      // ── Connection lines (behind nodes, above light glows) ──
      const connectionLines = new ConnectionLines();
      connectionLinesRef.current = connectionLines;
      worldLayer.addChild(connectionLines);

      // ── Central Node ──────────────────────────────────
      const centralNode = new CentralNode();
      worldLayer.addChild(centralNode);
      centralNode.attach(app.ticker);
      centralNodeRef.current = centralNode;

      // Central node glow
      const centralLight = new PointLight({
        color: 0x66ddff,
        radius: 100,
        intensity: 0.4,
        pulseSpeed: 1.2,
        pulseAmount: 0.04,
      });
      centralLight.x = 0;
      centralLight.y = 0;
      lightManager.addLight(centralLight);
      centralLightRef.current = centralLight;

      // ── Ambient light (very faint, covers the whole world) ──────
      const ambientLight = new PointLight({
        color: 0x1a3355,
        radius: 5000,
        intensity: 0.04,
        pulseSpeed: 0.3,
        pulseAmount: 0.02,
      });
      ambientLight.x = 0;
      ambientLight.y = 0;
      lightManager.addLight(ambientLight);

      // ── Shared click handler for memory nodes ─────────
      const onClickNode = (id: string) => {
        const numId = Number(id);
        const worldNode = allWorldNodesRef.current.get(numId);
        // Do nothing if node doesn't exist or is still locked
        if (!worldNode || !unlockedIdsRef.current.has(numId)) return;
        chatBubbleRef.current?.destroy();
        const bubble = new ChatBubble(worldNode.text);
        const s = memoryScaleRef.current;
        bubble.x = worldNode.x * s - bubble.bubbleWidth / 2;
        bubble.y = worldNode.y * s - 40 - bubble.bubbleHeight;
        chatBubbleRef.current = bubble;
        worldLayer.addChild(bubble);
      };

      // ── Helper: animate-unlock a single node ──────────
      const animateUnlockOne = (id: number) => {
        const unlocked = unlockedIdsRef.current;
        if (unlocked.has(id) || animatingRef.current.has(id)) return;

        const node = nodeByIdRef.current.get(id);
        const worldNode = allWorldNodesRef.current.get(id);
        if (!node || !worldNode) return;

        const s = memoryScaleRef.current;
        const nodeX = worldNode.x * s;
        const nodeY = worldNode.y * s;

        // Find source position for the pulse (nearest unlocked connected node)
        let srcX = 0, srcY = 0;
        let foundSource = false;
        if (worldNode.connections) {
          for (const connId of worldNode.connections) {
            if (unlocked.has(connId)) {
              const cw = allWorldNodesRef.current.get(connId);
              if (cw) { srcX = cw.x * s; srcY = cw.y * s; foundSource = true; break; }
            }
          }
        }

        // Mark as animating
        animatingRef.current.add(id);
        unlocked.add(id);

        // 1) Rebuild connections immediately (pulse overlays on top)
        rebuildConnections();

        const finishUnlock = () => {
          node.startUnlockAnimation(() => {
            const light = new PointLight({
              color: 0x00ccff,
              radius: 60,
              intensity: 0.6,
              pulseSpeed: 1.5 + Math.random() * 0.8,
              pulseAmount: 0.05 + Math.random() * 0.04,
            });
            light.x = nodeX;
            light.y = nodeY;
            light.alpha = 0;
            lightManager.addLight(light);
            lightByIdRef.current.set(id, light);
            memoryLightRefs.current.push(light);
            fadingLightsRef.current.set(light, 0);

            animatingRef.current.delete(id);
            setUnlockedCount(unlocked.size);
            rebuildConnections();
          });
        };

        if (foundSource) {
          // 2) Animate pulse along the connection line, then unlock
          connectionLinesRef.current?.startPulse(srcX, srcY, nodeX, nodeY, 600, finishUnlock);
        } else {
          // No connected neighbor unlocked — skip pulse, unlock directly
          finishUnlock();
        }
      };

      // ── Helper: unlock a set of memory IDs (animated) ─
      const unlockNodes = (ids: number[]) => {
        const unlocked = unlockedIdsRef.current;
        const toAnimate = ids.filter((id) => !unlocked.has(id));
        if (toAnimate.length === 0) return;
        // Animate each node with a small stagger
        for (let i = 0; i < toAnimate.length; i++) {
          setTimeout(() => animateUnlockOne(toAnimate[i]), i * 350);
        }
      };

      // ── Helper: rebuild connection lines ──────────────
      const rebuildConnections = () => {
        const unlocked = unlockedIdsRef.current;
        const unlockedStr = new Set<string>();
        for (const id of unlocked) unlockedStr.add(String(id));

        const memPositions = Array.from(allWorldNodesRef.current.values()).map((m) => ({
          id: String(m.id),
          x: m.x * memoryScaleRef.current,
          y: m.y * memoryScaleRef.current,
          connections: m.connections,
        }));
        connectionLinesRef.current?.update({ x: 0, y: 0 }, memPositions, unlockedStr);
      };
      rebuildConnectionsRef.current = rebuildConnections;
      unlockNodesRef.current = unlockNodes;

      // ── Fetch all world data + create locked nodes ────
      const abortCtl = new AbortController();
      abortRef.current = abortCtl;
      const loadAllWorldData = async () => {
        try {
          // Preload sprite texture before creating any nodes
          console.log(`[World #${mountId}] preloading texture…`);
          await preloadMemoryNodeTexture();
          if (!mountedRef.current || abortCtl.signal.aborted) {
            console.log(`[World #${mountId}] unmounted after preload, aborting`);
            return;
          }
          console.log(`[World #${mountId}] preload complete, fetching /send-all…`);

          const res = await fetch('/send-all', { method: 'POST', signal: abortCtl.signal });
          const worldData: WorldNodeData[] = await res.json();
          if (!mountedRef.current || abortCtl.signal.aborted) {
            console.log(`[World #${mountId}] unmounted after fetch, aborting`);
            return;
          }
          console.log(`[World #${mountId}] fetch complete, ${worldData.length} nodes`);

          const map = new Map<number, WorldNodeData>();
          for (const w of worldData) map.set(w.id, w);
          allWorldNodesRef.current = map;
          totalNodeCountRef.current = worldData.length;
          setAllWorldLog(worldData);

          const s = memoryScaleRef.current;
          let createdCount = 0;
          for (const w of worldData) {
            if (!mountedRef.current || abortCtl.signal.aborted) {
              console.log(`[World #${mountId}] unmounted mid-node-creation, aborting`);
              return;
            }
            // Skip if this node already exists (re-fetch guard)
            if (nodeByIdRef.current.has(w.id)) continue;
            const node = new MemoryNode({
              data: {
                id: String(w.id),
                x: w.x * s,
                y: w.y * s,
                state: 'locked',
              },
              onClick: onClickNode,
            });
            // Validate texture
            const sprite = (node as any).sprite as PIXI.Sprite | undefined;
            if (sprite) {
              console.log(`[World #${mountId}] node ${w.id} texture.valid = ${sprite.texture.valid}`);
            }
            // Verify worldLayer is still valid
            if (!worldLayerRef.current || worldLayerRef.current.destroyed) {
              console.error(`[World #${mountId}] worldLayer destroyed before adding node ${w.id}!`);
              node.destroy();
              return;
            }
            worldLayer.addChild(node);
            console.log(`[World #${mountId}] created node ${w.id} at (${w.x * s}, ${w.y * s})`);
            memoryNodesRef.current.push(node);
            nodeByIdRef.current.set(w.id, node);
            createdCount++;
          }
          console.log(`[World #${mountId}] created ${createdCount} nodes, worldLayer.children.length = ${worldLayer.children.length}`);

          // Draw connection lines for all nodes (all locked initially)
          rebuildConnectionsRef.current();

          camera.goTo(150, 100, 1.5);
          camera.snap();

        } catch (err) {
          console.error('Failed to load world data:', err);
        }
      };
      loadAllWorldDataRef.current = loadAllWorldData;

      // Initial camera position — world point (200,110) centered on screen
      camera.goTo(150, 100, 1.5);
      camera.snap();
      loadAllWorldData();

      // ── Ask Backend (unlocks returned memories) ───────
      const askBackend = async (q: string) => {
        if (!mountedRef.current) return;
        setLoading(true);
        centralNode.pulse();
        try {
          const res = await fetch(`/ask?query=${encodeURIComponent(q)}`, { method: 'POST', signal: abortCtl.signal });
          const data: AskResponse = await res.json();
          if (!mountedRef.current) return;

          // Collect returned mem_ids
          const returnedIds = data.memories.map((m) => m.mem_id);

          // Unlock them (if they exist in our world data)
          unlockNodes(returnedIds);

          // Also add to memory log (for reference)
          const prevMemories = allMemoriesRef.current;
          const prevIds = new Set(prevMemories.map((m) => m.mem_id));
          const newMemories = data.memories.filter((m) => !prevIds.has(m.mem_id));
          allMemoriesRef.current = [...prevMemories, ...newMemories];
          setMemoryLog((prev) => [...prev, ...newMemories]);

          // Show LLM response in a chat bubble above the central node
          chatBubbleRef.current?.destroy();
          const bubble = new ChatBubble(data.contents);
          bubble.x = -bubble.bubbleWidth / 2;
          bubble.y = -80 - bubble.bubbleHeight;
          chatBubbleRef.current = bubble;
          worldLayer.addChild(bubble);

          // Flare the central node on response
          setTimeout(() => centralNode.flare(), 300);
        } catch (err) {
          console.error('Backend request failed:', err);
        } finally {
          setLoading(false);
        }
      };

      const input = new InputNode({
        onSubmit: askBackend,
        placeholder: 'Ask the right questions',
      });
      input.x = -120;
      input.y = 40;
      worldLayer.addChild(input);
      inputRef.current = input;

      // ── Dust noise (screen-space, behind HUD) ─────────
      const dustNoise = new DustNoise(initW, initH);
      hudLayer.addChild(dustNoise);
      dustNoiseRef.current = dustNoise;

      // ── HUD ───────────────────────────────────────────
      const hud = new HUDLayer();
      hudLayer.addChild(hud);

      // ── Interaction (on stage, not worldLayer — stage is always full-screen) ──
      app.stage.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
        input.blur();
        // Dismiss chat bubble on background click
        if (chatBubbleRef.current) {
          worldLayer.removeChild(chatBubbleRef.current);
          chatBubbleRef.current.destroy();
          chatBubbleRef.current = null;
        }
        camera.onPointerDown(e.global.x, e.global.y);
        wrapper.style.cursor = 'grabbing';
      });
      app.stage.on('pointermove', (e: PIXI.FederatedPointerEvent) => {
        camera.onPointerMove(e.global.x, e.global.y);
      });
      app.stage.on('pointerup', () => {
        camera.onPointerUp();
        wrapper.style.cursor = 'grab';
      });
      app.stage.on('pointerupoutside', () => {
        camera.onPointerUp();
        wrapper.style.cursor = 'grab';
      });
      app.stage.on('wheel', (e: PIXI.FederatedWheelEvent) => {
        camera.onWheel(e.global.x, e.global.y, e.deltaY);
      });

      // Prevent native page scroll
      const preventScroll = (e: WheelEvent) => e.preventDefault();
      canvas.addEventListener('wheel', preventScroll, { passive: false });

      // Input node stops propagation so it doesn't trigger camera drag
      input.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
        e.stopPropagation();
        input.focus();
      });

      // ── Ticker ────────────────────────────────────────
      camera.attachTicker(app.ticker);
      const tickerFn = () => {
        const dtMs = app.ticker.deltaMS;
        const dtSec = dtMs / 1000;

        grid.update(camera);
        lightManager.tick(dtMs);
        for (let i = 0; i < floorLights.length; i++) floorLights[i].update(dtSec);
        dustNoise.update(dtSec);
        dustParticles.update(camera, dtSec);
        input.tick(dtMs);
        hud.update(camera, dtMs);

        // Connection line pulse animation
        connectionLinesRef.current?.tick(dtMs);

        // Memory node unlock animations
        for (let i = 0; i < memoryNodesRef.current.length; i++) {
          memoryNodesRef.current[i].tick(dtMs);
        }

        // Fade-in newly created lights
        for (const [light, elapsed] of fadingLightsRef.current) {
          const next = elapsed + dtMs;
          light.alpha = Math.min(next / 500, 1) * light.config.intensity;
          if (next >= 500) fadingLightsRef.current.delete(light);
          else fadingLightsRef.current.set(light, next);
        }

        // Chat bubble auto-fade lifecycle
        if (chatBubbleRef.current) {
          const done = chatBubbleRef.current.tick(dtMs);
          if (done) {
            worldLayer.removeChild(chatBubbleRef.current);
            chatBubbleRef.current.destroy();
            chatBubbleRef.current = null;
          }
        }
      };
      app.ticker.add(tickerFn);

      // ── Resize ────────────────────────────────────────
      const ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const w = entry.contentRect.width;
          const h = entry.contentRect.height;
          app.renderer.resize(w, h);
          camera.resize(w, h);
          hitArea.width = w;
          hitArea.height = h;
          bgFill.clear();
          bgFill.beginFill(0x1a1a1a);
          bgFill.drawRect(0, 0, w, h);
          bgFill.endFill();
          dustNoiseRef.current?.resize(w, h);
        }
      });
      ro.observe(wrapper);

      // ── Cleanup ───────────────────────────────────────
      return () => {
        mountedRef.current = false;
        abortCtl.abort();
        console.log(`[World #${mountId}] cleanup — aborting fetch, destroying ${memoryNodesRef.current.length} nodes, worldLayer.children=${worldLayer.children.length}`);
        ro.disconnect();
        centralNode.detach();
        camera.detachTicker();
        app.ticker.remove(tickerFn);
        canvas.removeEventListener('wheel', preventScroll);
        // Destroy floor lights
        for (let i = 0; i < floorLightRef.current.length; i++) {
          floorLightRef.current[i].destroy();
        }
        floorLightRef.current = [];
        // Destroy dust noise
        if (dustNoiseRef.current) {
          dustNoiseRef.current.destroy();
          dustNoiseRef.current = null;
        }
        // Destroy dust particles
        if (dustParticlesRef.current) {
          dustParticlesRef.current.destroy();
          dustParticlesRef.current = null;
        }
        // Destroy all lights
        lightManagerRef.current?.clear();
        memoryLightRefs.current = [];
        centralLightRef.current = null;
        fadingLightsRef.current.clear();
        // Destroy connection lines
        if (connectionLinesRef.current) {
          connectionLinesRef.current.destroy();
          connectionLinesRef.current = null;
        }
        // Destroy all memory nodes
        memoryNodesRef.current.forEach((n) => n.destroy());
        memoryNodesRef.current = [];
        nodeByIdRef.current.clear();
        lightByIdRef.current.clear();
        allWorldNodesRef.current.clear();
        unlockedIdsRef.current.clear();
        animatingRef.current.clear();
        if (chatBubbleRef.current) {
          chatBubbleRef.current.destroy();
          chatBubbleRef.current = null;
        }
        app.destroy(true, { children: true });
        worldLayerRef.current = null;
        cameraRef.current = null;
        centralNodeRef.current = null;
        inputRef.current = null;
        gridRef.current = null;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Sync tile scale to BackgroundRenderer when changed via slider
    useEffect(() => {
      gridRef.current?.setTileScale(tileScale);
    }, [tileScale]);

    // Regenerate megatile texture when dark frequency changes
    const initialDarkFreqRef = useRef(true);
    useEffect(() => {
      // Skip initial call — constructor already generates the texture at this frequency
      if (initialDarkFreqRef.current) {
        initialDarkFreqRef.current = false;
        return;
      }
      gridRef.current?.setDarkFrequency(darkFreq / 100);
    }, [darkFreq]);

    // Sync central sprite scale
    useEffect(() => {
      CentralNode.setSpriteScale(centralScale);
      centralNodeRef.current?.applySpriteScale();
    }, [centralScale]);

    // Sync node sprite scale
    useEffect(() => {
      MemoryNode.setSpriteScale(nodeScale);
      for (const [, node] of nodeByIdRef.current) {
        node.applySpriteScale();
      }
    }, [nodeScale]);

    // Keep memoryScaleRef in sync and reposition existing nodes in real time
    useEffect(() => {
      memoryScaleRef.current = memoryScale;

      // Reposition all world nodes (both locked and unlocked)
      for (const [id, node] of nodeByIdRef.current) {
        const worldNode = allWorldNodesRef.current.get(id);
        if (worldNode) {
          node.x = worldNode.x * memoryScale;
          node.y = worldNode.y * memoryScale;
        }
      }

      // Reposition lights
      for (const [id, light] of lightByIdRef.current) {
        const worldNode = allWorldNodesRef.current.get(id);
        if (worldNode) {
          light.x = worldNode.x * memoryScale;
          light.y = worldNode.y * memoryScale;
        }
      }

      // Refresh connection lines after repositioning
      rebuildConnectionsRef.current();

      // Re-center — all nodes are centered at (0,0) by the backend
      const cam = cameraRef.current;
      if (cam && allWorldNodesRef.current.size > 0) {
        cam.goTo(150, 100, 1.5);
        cam.snap();
      }
    }, [memoryScale]);

    const toggleGrid = useCallback(() => {
      setGridVisible((v) => {
        const next = !v;
        if (gridRef.current) gridRef.current.gridVisible = next;
        return next;
      });
    }, []);

    const zoomIn = useCallback(() => {
      const cam = cameraRef.current;
      if (!cam) return;
      // Snap to next integer zoom for pixel-perfect rendering
      const current = cam.zoom;
      const next = current < 1 ? 1 : Math.floor(current) + 1;
      const newZoom = Math.min(next, 10);
      cam.goTo(0, 0, newZoom);
      setZoomLevel(newZoom);
    }, []);

    const zoomOut = useCallback(() => {
      const cam = cameraRef.current;
      if (!cam) return;
      // Snap to previous integer zoom for pixel-perfect rendering
      const current = cam.zoom;
      const prev = current <= 1 ? 0.5 : Math.ceil(current) - 1;
      const newZoom = Math.max(prev, 0.01);
      cam.goTo(0, 0, newZoom);
      setZoomLevel(newZoom);
    }, []);

    const zoomReset = useCallback(() => {
      const cam = cameraRef.current;
      if (!cam) return;
      cam.goTo(0, 0, 1);
      setZoomLevel(1);
    }, []);

    useImperativeHandle(ref, () => ({
      addToWorld: (child: PIXI.DisplayObject) => {
        worldLayerRef.current?.addChild(child);
      },
      removeFromWorld: (child: PIXI.DisplayObject) => {
        worldLayerRef.current?.removeChild(child);
      },
      resetCamera: () => cameraRef.current?.goTo(0, 0, 0.5),
      get centralNode() {
        return centralNodeRef.current!;
      },
    }));

    const btnStyle: React.CSSProperties = {
      background: '#2a2a2a',
      color: '#cccccc',
      border: '1px solid #444444',
      borderRadius: 6,
      padding: '6px 12px',
      fontSize: 12,
      fontFamily: 'monospace',
      cursor: 'pointer',
      userSelect: 'none',
    };

    return (
      <><div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
        <div
          ref={wrapperRef}
          style={{ width: '100%', height: '100%', cursor: 'grab', overflow: 'hidden' }}
        />{/* loading overlay removed */}
        <div
          style={{
            position: 'absolute',
            bottom: 16,
            right: 16,
            display: 'flex',
            gap: 8,
            alignItems: 'center',
          }}
        >
          <button style={btnStyle} onClick={toggleGrid}>
            {gridVisible ? '◈ Grid ON' : '◇ Grid OFF'}
          </button>
          <button style={btnStyle} onClick={zoomOut}>−</button>
          <button style={btnStyle} onClick={zoomReset}>{zoomLevel.toFixed(2)}×</button>
          <button style={btnStyle} onClick={zoomIn}>+</button>
        </div>
        <MemoryLogPanel
          memories={memoryLog}
          allMemories={allWorldLog}
          unlockedCount={unlockedCount}
          totalCount={totalNodeCountRef.current}
          onUnlockAll={() => unlockNodesRef.current(Array.from(allWorldNodesRef.current.keys()))}
          tileScale={tileScale}
          onTileScaleChange={setTileScale}
          centralScale={centralScale}
          onCentralScaleChange={setCentralScale}
          memoryScale={memoryScale}
          onMemoryScaleChange={setMemoryScale}
          darkFreq={darkFreq}
          onDarkFreqChange={setDarkFreq}
          nodeScale={nodeScale}
          onNodeScaleChange={setNodeScale}
        />
        <NotesPanel open={notesOpen} onClose={() => setNotesOpen(false)} />
      </div>
      {/* Notes toggle button at bottom-right */}
      <button
        style={{
          position: 'fixed', bottom: 16, right: 16, zIndex: 200,
          background: '#2a2a3a', border: '1px solid #444466',
          borderRadius: 6, color: '#8888cc', fontSize: 12, fontFamily: 'monospace',
          cursor: 'pointer', padding: '8px 14px', letterSpacing: 1.5,
          boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
        }}
        onClick={() => setNotesOpen(v => !v)}
      >
        {notesOpen ? '✕ NOTES' : '📓 NOTES'}
      </button>
    </>);
  },
);

World.displayName = 'World';
