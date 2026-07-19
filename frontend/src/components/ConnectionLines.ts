import * as PIXI from 'pixi.js';

interface NodePos {
  id: string;
  x: number;
  y: number;
  connections?: number[];
}

interface ActivePulse {
  fromX: number; fromY: number;
  toX: number; toY: number;
  elapsed: number;
  duration: number;
  onComplete: () => void;
}

/**
 * Draws connection lines between memory nodes.
 *
 * Three visual layers (back to front):
 *  1. **Locked lines** — dark, barely visible (for locked↔locked or locked↔unlocked)
 *  2. **Active glow lines** — additive-blended bright lines (unlocked↔unlocked)
 *  3. **Pulse overlay** — cyan energy pulse animating along a line during unlock
 */
export class ConnectionLines extends PIXI.Container {
  private lockedGfx: PIXI.Graphics;
  private glowGfx: PIXI.Graphics;
  private coreGfx: PIXI.Graphics;
  private pulseGfx: PIXI.Graphics;
  private _color = 0xffffff;
  private _pulses: ActivePulse[] = [];

  constructor() {
    super();
    this.eventMode = 'none';

    this.lockedGfx = new PIXI.Graphics();
    this.glowGfx = new PIXI.Graphics();
    this.coreGfx = new PIXI.Graphics();
    this.pulseGfx = new PIXI.Graphics();

    this.glowGfx.blendMode = PIXI.BLEND_MODES.ADD;
    this.coreGfx.blendMode = PIXI.BLEND_MODES.ADD;
    this.pulseGfx.blendMode = PIXI.BLEND_MODES.ADD;

    this.addChild(this.lockedGfx);  // bottom: dark locked lines
    this.addChild(this.glowGfx);    // middle: active glow
    this.addChild(this.coreGfx);    // middle: active core
    this.addChild(this.pulseGfx);   // top: animated pulse
  }

  /**
   * Rebuild all connection lines.
   *
   * @param centralPos  `{x, y}` of the central node, or null.
   * @param memoryNodes  Array of all memory nodes.
   * @param unlockedIds  Set of unlocked node ids (string form).
   */
  update(
    centralPos: { x: number; y: number } | null,
    memoryNodes: NodePos[],
    unlockedIds?: Set<string>,
  ): void {
    this.lockedGfx.clear();
    this.glowGfx.clear();
    this.coreGfx.clear();

    if (memoryNodes.length === 0) return;

    const idToPos = new Map<string, NodePos>();
    for (const n of memoryNodes) idToPos.set(n.id, n);

    const isUnlocked = (id: string): boolean =>
      !!unlockedIds && unlockedIds.has(id);

    // ── Draw ALL connections (locked lines + unlocked lines) ──
    // We iterate once over all nodes with connections, drawing:
    //   - dark lines if either endpoint is locked
    //   - bright lines if both endpoints are unlocked
    const drawn = new Set<string>();

    for (const node of memoryNodes) {
      if (!node.connections) continue;
      for (const connId of node.connections) {
        const connStr = String(connId);
        const key = node.id < connStr ? `${node.id}-${connStr}` : `${connStr}-${node.id}`;
        if (drawn.has(key)) continue;
        drawn.add(key);

        const target = idToPos.get(connStr);
        if (!target) continue;

        const nodeUnlocked = isUnlocked(node.id);
        const targetUnlocked = isUnlocked(connStr);

        if (nodeUnlocked && targetUnlocked) {
          // Both unlocked → bright 100% opacity line
          this.drawActiveLine(node.x, node.y, target.x, target.y);
        } else {
          // At least one locked → visible at 20% opacity
          this.drawLockedLine(node.x, node.y, target.x, target.y);
        }
      }
    }

    // ── Central node → closest unlocked nodes ──
    if (centralPos && unlockedIds && unlockedIds.size > 0) {
      const candidates: { id: string; dist: number; x: number; y: number }[] = [];
      for (const node of memoryNodes) {
        if (!isUnlocked(node.id)) continue;
        const dx = node.x - centralPos.x;
        const dy = node.y - centralPos.y;
        candidates.push({ id: node.id, dist: dx * dx + dy * dy, x: node.x, y: node.y });
      }
      candidates.sort((a, b) => a.dist - b.dist);
      const centralDrawn = new Set<string>();
      for (let i = 0; i < Math.min(4, candidates.length); i++) {
        const c = candidates[i];
        const key = `central-${c.id}`;
        if (centralDrawn.has(key)) continue;
        centralDrawn.add(key);
        this.drawActiveLine(centralPos.x, centralPos.y, c.x, c.y);
      }
    }
  }

  /** Start a pulse animation along a line. `duration` in ms. */
  startPulse(
    fromX: number, fromY: number,
    toX: number, toY: number,
    duration = 600,
    onComplete?: () => void,
  ): void {
    this._pulses.push({
      fromX, fromY, toX, toY,
      elapsed: 0,
      duration,
      onComplete: onComplete ?? (() => {}),
    });
  }

  /** Called every frame. `dt` in ms. */
  tick(dt: number): void {
    if (this._pulses.length === 0) return;
    this.pulseGfx.clear();

    for (let i = this._pulses.length - 1; i >= 0; i--) {
      const p = this._pulses[i];
      p.elapsed += dt;
      const t = Math.min(p.elapsed / p.duration, 1);

      // Animate a bright cyan segment from start toward end
      const dx = p.toX - p.fromX;
      const dy = p.toY - p.fromY;
      const endX = p.fromX + dx * t;
      const endY = p.fromY + dy * t;

      // Glow pass
      this.pulseGfx.lineStyle(6, 0x33eeff, 0.25 * (1 - t * 0.5));
      this.pulseGfx.moveTo(p.fromX, p.fromY);
      this.pulseGfx.lineTo(endX, endY);

      // Core pass (bright cyan)
      this.pulseGfx.lineStyle(2.5, 0x66ffff, 0.85);
      this.pulseGfx.moveTo(p.fromX, p.fromY);
      this.pulseGfx.lineTo(endX, endY);

      // Leading dot
      this.pulseGfx.beginFill(0x88ffff, 0.9);
      this.pulseGfx.drawCircle(endX, endY, 3);
      this.pulseGfx.endFill();

      if (t >= 1) {
        p.onComplete();
        this._pulses.splice(i, 1);
      }
    }
  }

  // ── Private line drawers ──────────────────────────────────────────

  private drawLockedLine(x1: number, y1: number, x2: number, y2: number): void {
    this.lockedGfx.lineStyle(2, 0x5577aa, 0.20);
    this.lockedGfx.moveTo(x1, y1);
    this.lockedGfx.lineTo(x2, y2);
  }

  private drawActiveLine(x1: number, y1: number, x2: number, y2: number): void {
    this.glowGfx.lineStyle(4, this._color, 0.35);
    this.glowGfx.moveTo(x1, y1);
    this.glowGfx.lineTo(x2, y2);

    this.coreGfx.lineStyle(1.5, this._color, 1.0);
    this.coreGfx.moveTo(x1, y1);
    this.coreGfx.lineTo(x2, y2);
  }
}
