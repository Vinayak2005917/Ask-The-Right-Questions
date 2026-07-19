import * as PIXI from 'pixi.js';

// ── Shared radial gradient texture ────────────────────────────────────────

let _glowTexture: PIXI.Texture | null = null;
const GLOW_TEX_SIZE = 256;

function getGlowTexture(): PIXI.Texture {
  if (_glowTexture) return _glowTexture;

  const canvas = document.createElement('canvas');
  canvas.width = GLOW_TEX_SIZE;
  canvas.height = GLOW_TEX_SIZE;
  const ctx = canvas.getContext('2d')!;

  const cx = GLOW_TEX_SIZE / 2;
  const cy = GLOW_TEX_SIZE / 2;
  const r = GLOW_TEX_SIZE / 2;

  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.15, 'rgba(255,255,255,0.85)');
  gradient.addColorStop(0.4, 'rgba(255,255,255,0.35)');
  gradient.addColorStop(0.7, 'rgba(255,255,255,0.08)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, GLOW_TEX_SIZE, GLOW_TEX_SIZE);

  _glowTexture = PIXI.Texture.from(canvas);
  _glowTexture.baseTexture.scaleMode = PIXI.SCALE_MODES.LINEAR;
  return _glowTexture;
}

// ── Config ────────────────────────────────────────────────────────────────

export interface LightConfig {
  /** RGB tint, e.g. 0x00ccff for cyan. Default: 0x00ccff */
  color?: number;
  /** Visual radius in world-space pixels at scale=1. Default: 80 */
  radius?: number;
  /** Alpha multiplier. Default: 1 */
  intensity?: number;
  /** Pulse speed in radians/second. Default: 1.8 */
  pulseSpeed?: number;
  /** Pulse magnitude as fraction of radius (±). Default: 0.06 */
  pulseAmount?: number;
}

const DEFAULTS: Required<LightConfig> = {
  color: 0x00ccff,
  radius: 80,
  intensity: 1,
  pulseSpeed: 1.8,
  pulseAmount: 0.06,
};

// ── PointLight ────────────────────────────────────────────────────────────

/**
 * A soft additive-blended glow sprite that pulses slowly.
 *
 * - Renders a radial gradient (bright → transparent) with **additive blending**
 *   so nearby lights naturally叠加 and brighten each other.
 * - Each light has a random pulse phase offset so they don't all pulse in sync.
 */
export class PointLight extends PIXI.Sprite {
  public readonly config: Required<LightConfig>;
  private pulsePhase: number;

  constructor(config: LightConfig = {}) {
    super(getGlowTexture());

    this.config = { ...DEFAULTS, ...config };
    this.pulsePhase = Math.random() * Math.PI * 2;

    this.anchor.set(0.5);
    this.blendMode = PIXI.BLEND_MODES.ADD;
    this.tint = this.config.color;
    this.alpha = this.config.intensity;

    const baseScale = (this.config.radius * 2) / GLOW_TEX_SIZE;
    this.scale.set(baseScale);
  }

  /** Call every frame. `dt` in seconds. */
  update(dt: number): void {
    this.pulsePhase += dt * this.config.pulseSpeed;
    const pulse = 1 + this.config.pulseAmount * Math.sin(this.pulsePhase);
    const baseScale = (this.config.radius * 2) / GLOW_TEX_SIZE;
    this.scale.set(baseScale * pulse);
  }
}
