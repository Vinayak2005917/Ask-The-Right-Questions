import * as PIXI from 'pixi.js';
import memoryNodeUrl from '../assets/Memory_nodes.png?url';
//DO NOT TOUCH THIS, THIS IS CORRECT : import memoryNodeUrl from '../assets/Memory_nodes.png?url';
let _globalSpriteScale = 3;

// Locked: dark blue-gray tint, 25% opacity — exists in world but barely visible.
// Active: full white, full opacity.
const STATE_TINTS: Record<MemoryNodeState, number> = {
  locked: 0x111a2a,
  active: 0xffffff,
};

const STATE_ALPHAS: Record<MemoryNodeState, number> = {
  locked: 0.8,
  active: 1,
};

export type MemoryNodeState = 'locked' | 'active';

// ── Unlock animation duration (ms) ───────────────────────────────────
const UNLOCK_DURATION = 600;
const FLASH_DURATION = 200; // brief scale pulse at end

export interface MemoryNodeData {
  id: string;
  x: number;
  y: number;
  state: MemoryNodeState;
}

interface MemoryNodeOptions {
  data: MemoryNodeData;
  onClick?: (id: string) => void;
}

// ── Shared texture (preloaded eagerly via raw Image) ──────────────────────

let _memoryNodeTex: PIXI.Texture | null = null;
let _textureLoadPromise: Promise<void> | null = null;

function getMemoryNodeTexture(): PIXI.Texture {
  if (_memoryNodeTex) return _memoryNodeTex;
  // Fallback synchronous creation (if preload was somehow skipped)
  _memoryNodeTex = PIXI.Texture.from(memoryNodeUrl);
  _memoryNodeTex.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
  return _memoryNodeTex;
}

/** Eagerly preload the sprite texture – call before creating nodes.
 *  Uses raw Image() to avoid PixiJS asset-cache races. */
export async function preloadMemoryNodeTexture(): Promise<void> {
  if (_memoryNodeTex) return;
  if (_textureLoadPromise) return _textureLoadPromise;
  _textureLoadPromise = new Promise<void>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const base = new PIXI.BaseTexture(img, { scaleMode: PIXI.SCALE_MODES.NEAREST });
      _memoryNodeTex = new PIXI.Texture(base);
      resolve();
    };
    img.onerror = () => {
      _textureLoadPromise = null; // allow retry
      reject(new Error(`Failed to load ${memoryNodeUrl}`));
    };
    img.src = memoryNodeUrl;
  });
  return _textureLoadPromise;
}

// ── MemoryNode ────────────────────────────────────────────────────────────

export class MemoryNode extends PIXI.Container {
  public readonly nodeId: string;
  private sprite: PIXI.Sprite;
  private label: PIXI.Text;
  private _state: MemoryNodeState;

  // ── Unlock animation state ────────────────────────────────────────
  private _isUnlocking = false;
  private _unlockElapsed = 0;
  private _unlockDone = false;
  private _onUnlockComplete: (() => void) | null = null;
  private _flashElapsed = 0;
  private _inFlash = false;

  static setSpriteScale(s: number) {
    _globalSpriteScale = s;
  }

  applySpriteScale() {
    this.sprite.scale.set(_globalSpriteScale);
  }

  constructor({ data, onClick }: MemoryNodeOptions) {
    super();

    this.nodeId = data.id;
    this._state = data.state;
    this.x = data.x;
    this.y = data.y;

    this.eventMode = 'static';
    this.cursor = 'pointer';

    // Pixel-art sprite
    this.sprite = new PIXI.Sprite(getMemoryNodeTexture());
    this.sprite.anchor.set(0.5);
    this.sprite.scale.set(_globalSpriteScale);
    this.addChild(this.sprite);

    // Label (truncated id) — centered on the sprite
    this.label = new PIXI.Text(this.truncate(data.id), {
      fontSize: 14,
      fill: 0xd8d8d8,
      fontFamily: 'monospace',
    });
    this.label.y = 10;
    this.label.x = -3.5;
    this.label.anchor.set(0.2, 0.5);
    this.addChild(this.label);

    this.applyState(data.state);

    // Click handler (stops propagation to prevent camera drag on the stage)
    if (onClick) {
      this.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
        e.stopPropagation();
        onClick(data.id);
      });
    }
  }

  get state(): MemoryNodeState {
    return this._state;
  }

  set state(next: MemoryNodeState) {
    if (next !== this._state) {
      this._state = next;
      this.applyState(next);
    }
  }

  get isUnlocking(): boolean { return this._isUnlocking; }
  get unlockDone(): boolean { return this._unlockDone; }

  /** Start the unlock animation. Calls `onComplete` when done. */
  startUnlockAnimation(onComplete?: () => void): void {
    if (this._unlockDone) { onComplete?.(); return; }
    this._isUnlocking = true;
    this._unlockElapsed = 0;
    this._onUnlockComplete = onComplete ?? null;
    // Ensure we start from locked visual
    this.sprite.tint = STATE_TINTS.locked;
    this.alpha = STATE_ALPHAS.locked;
  }

  /** Called every frame by World. `dt` in ms. */
  tick(dt: number): void {
    if (!this._isUnlocking) return;

    this._unlockElapsed += dt;
    const progress = Math.min(this._unlockElapsed / UNLOCK_DURATION, 1);

    // Interpolate alpha: 0.25 → 1.0
    this.alpha = STATE_ALPHAS.locked + (1 - STATE_ALPHAS.locked) * progress;
    // Interpolate tint: dark blue-gray → white
    this.sprite.tint = lerpColor(0x111a2a, 0xffffff, progress);
    // Reveal label halfway through
    if (progress >= 0.5 && !this.label.visible) {
      this.label.visible = true;
    }

    if (progress >= 1) {
      // Enter flash phase
      this._isUnlocking = false;
      this._inFlash = true;
      this._flashElapsed = 0;
      this._state = 'active';
    }

    // Flash (brief scale pulse after reaching full brightness)
    if (this._inFlash) {
      this._flashElapsed += dt;
      const fp = Math.min(this._flashElapsed / FLASH_DURATION, 1);
      // Scale up 20% then back
      const flashScale = fp < 0.4
        ? 1 + 0.2 * (fp / 0.4)
        : 1 + 0.2 * (1 - (fp - 0.4) / 0.6);
      this.sprite.scale.set(_globalSpriteScale * flashScale);
      // Brief alpha overshoot
      this.alpha = fp < 0.4 ? 1 : 1 - 0.15 * (fp - 0.4) / 0.6;

      if (fp >= 1) {
        this._inFlash = false;
        this._unlockDone = true;
        this.sprite.scale.set(_globalSpriteScale);
        this.alpha = 1;
        this.sprite.tint = 0xffffff;
        this._onUnlockComplete?.();
        this._onUnlockComplete = null;
      }
    }
  }

  /** Reset to locked state (for cleanup/re-init). */
  resetToLocked(): void {
    this._isUnlocking = false;
    this._unlockDone = false;
    this._inFlash = false;
    this._unlockElapsed = 0;
    this._flashElapsed = 0;
    this._state = 'locked';
    this.applyState('locked');
    this.sprite.scale.set(_globalSpriteScale);
  }

  private applyState(state: MemoryNodeState) {
    this.sprite.tint = STATE_TINTS[state];
    this.alpha = STATE_ALPHAS[state];
    this.label.visible = state === 'active';
  }

  private truncate(id: string): string {
    return id.length > 10 ? id.slice(0, 8) + '…' : id;
  }

  /** Convenience factory to create multiple nodes at once. */
  static createBatch(
    items: MemoryNodeData[],
    onClick?: (id: string) => void,
  ): MemoryNode[] {
    return items.map((data) => new MemoryNode({ data, onClick }));
  }
}

// ── Helper: interpolate two hex colors ─────────────────────────────────
function lerpColor(from: number, to: number, t: number): number {
  const fr = (from >> 16) & 0xff, fg = (from >> 8) & 0xff, fb = from & 0xff;
  const tr = (to >> 16) & 0xff, tg = (to >> 8) & 0xff, tb = to & 0xff;
  const r = Math.round(fr + (tr - fr) * t);
  const g = Math.round(fg + (tg - fg) * t);
  const b = Math.round(fb + (tb - fb) * t);
  return (r << 16) | (g << 8) | b;
}
