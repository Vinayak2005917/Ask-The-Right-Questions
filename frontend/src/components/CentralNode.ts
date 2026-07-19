import * as PIXI from 'pixi.js';

let _globalCentralScale = 2;

export type CentralNodeAnimation = 'none' | 'pulse' | 'flare';

// ── Shared texture (loaded once via Vite glob, like the tiles) ────────────

let _centralNodeTex: PIXI.Texture | null = null;

function getCentralNodeTexture(): PIXI.Texture {
  if (_centralNodeTex) return _centralNodeTex;

  const modules = import.meta.glob<{ default: string }>(
    '/src/assets/new.png',
    { eager: true, query: '?url' },
  );
  const url = Object.values(modules)[0]?.default;
  _centralNodeTex = PIXI.Texture.from(url);
  _centralNodeTex.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
  return _centralNodeTex;
}

/**
 * Central node at world origin (0,0).
 */
export class CentralNode extends PIXI.Container {
  private core: PIXI.Sprite;
  private ticker?: PIXI.Ticker;
  private tickerFn?: () => void;

  private overrideAnim: CentralNodeAnimation = 'none';
  private overrideTime = 0;

  static setSpriteScale(s: number) {
    _globalCentralScale = s;
  }

  applySpriteScale() {
    this.core.scale.set(_globalCentralScale);
  }

  constructor() {
    super();

    this.core = new PIXI.Sprite(getCentralNodeTexture());
    this.core.anchor.set(0.5);
    this.core.scale.set(_globalCentralScale);
    this.addChild(this.core);
  }

  attach(ticker: PIXI.Ticker): void {
    this.detach();
    this.ticker = ticker;
    this.tickerFn = () => this.tick(ticker.deltaMS);
    ticker.add(this.tickerFn);
  }

  detach(): void {
    if (this.ticker && this.tickerFn) {
      this.ticker.remove(this.tickerFn);
    }
    this.ticker = undefined;
    this.tickerFn = undefined;
  }

  pulse(): void {
    this.overrideAnim = 'pulse';
    this.overrideTime = 0;
  }

  flare(): void {
    this.overrideAnim = 'flare';
    this.overrideTime = 0;
  }

  destroy(): void {
    this.detach();
    super.destroy({ children: true });
  }

  // ── Internal ──────────────────────────────────────────────

  private tick(deltaMs: number): void {
    const dt = deltaMs / 1000; // seconds

    // Override animations
    if (this.overrideAnim !== 'none') {
      this.overrideTime += dt;
      const t = this.overrideTime;

      if (this.overrideAnim === 'pulse') {
        const progress = Math.min(t / 0.4, 1);
        const scale = progress < 0.3
          ? 1 + 0.25 * (progress / 0.3)
          : 1 + 0.25 * (1 - (progress - 0.3) / 0.7);
        const alpha = progress < 0.5 ? 1 : 1 - (progress - 0.5) / 0.5;
        const s = _globalCentralScale * scale;
        this.core.scale.set(s);
        this.core.alpha = Math.max(0.3, alpha);

        if (t > 1) {
          this.overrideAnim = 'none';
          this.core.scale.set(_globalCentralScale);
          this.core.alpha = 1;
        }
      } else if (this.overrideAnim === 'flare') {
        if (t > 0.8) {
          this.overrideAnim = 'none';
        }
      }
    }
  }
}  
