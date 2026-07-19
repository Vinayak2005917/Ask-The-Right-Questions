import * as PIXI from 'pixi.js';

// ── Shared noise texture ──────────────────────────────────────────────────

let _noiseTexture: PIXI.Texture | null = null;
const NOISE_SIZE = 128;

function getNoiseTexture(): PIXI.Texture {
  if (_noiseTexture) return _noiseTexture;

  const canvas = document.createElement('canvas');
  canvas.width = NOISE_SIZE;
  canvas.height = NOISE_SIZE;
  const ctx = canvas.getContext('2d')!;

  const imageData = ctx.createImageData(NOISE_SIZE, NOISE_SIZE);
  for (let i = 0; i < imageData.data.length; i += 4) {
    // Perlin-like value distribution: mostly dark with occasional bright specks
    const v = Math.floor(Math.random() * 60);
    imageData.data[i] = v;
    imageData.data[i + 1] = v;
    imageData.data[i + 2] = v;
    imageData.data[i + 3] = v;
  }
  ctx.putImageData(imageData, 0, 0);

  _noiseTexture = PIXI.Texture.from(canvas);
  _noiseTexture.baseTexture.scaleMode = PIXI.SCALE_MODES.LINEAR;
  return _noiseTexture;
}

// ── DustNoise ─────────────────────────────────────────────────────────────

/**
 * Screen-space animated noise overlay.
 *
 * Uses additive blending at a very low alpha so it acts like glowing
 * dust particles suspended in the air.  The noise pattern slowly drifts
 * and the alpha gently wobbles, creating a subtle shimmer / "dusty"
 * atmosphere wherever light sources are visible.
 *
 * Placed in the HUD layer so it always covers the viewport.
 */
export class DustNoise extends PIXI.TilingSprite {
  private driftX = 0;
  private driftY = 0;

  constructor(screenWidth: number, screenHeight: number) {
    super(getNoiseTexture(), screenWidth, screenHeight);

    this.blendMode = PIXI.BLEND_MODES.ADD;
    this.alpha = 0.03;
    this.tileScale.set(3);
    this.eventMode = 'none';
  }

  /** `dt` in seconds. Call once per frame. */
  update(dt: number): void {
    this.driftX += dt * 1.8;
    this.driftY += dt * 1.2;
    this.tilePosition.x = Math.round(this.driftX);
    this.tilePosition.y = Math.round(this.driftY);

    // Gentle alpha wobble so the shimmer breathes
    this.alpha = 0.025 + 0.01 * Math.sin(this.driftX * 0.008);
  }

  /** Keep in sync with the canvas size (call from resize handler). */
  resize(w: number, h: number): void {
    this.width = w;
    this.height = h;
  }
}
