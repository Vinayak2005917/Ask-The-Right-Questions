import * as PIXI from 'pixi.js';

// ── Shared bar glow texture (elliptical for fluorescent strip) ────────────

let _barGlowTex: PIXI.Texture | null = null;
const BAR_TEX_W = 128;
const BAR_TEX_H = 48;

function getBarGlowTexture(): PIXI.Texture {
  if (_barGlowTex) return _barGlowTex;

  const canvas = document.createElement('canvas');
  canvas.width = BAR_TEX_W;
  canvas.height = BAR_TEX_H;
  const ctx = canvas.getContext('2d')!;

  const cx = BAR_TEX_W / 2;
  const cy = BAR_TEX_H / 2;
  const r = BAR_TEX_W / 2;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.12, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.12)');
  g.addColorStop(1, 'rgba(255,255,255,0)');

  ctx.fillStyle = g;
  ctx.fillRect(0, 0, BAR_TEX_W, BAR_TEX_H);

  _barGlowTex = PIXI.Texture.from(canvas);
  _barGlowTex.baseTexture.scaleMode = PIXI.SCALE_MODES.LINEAR;
  return _barGlowTex;
}

// ── FloorLight ────────────────────────────────────────────────────────────

/**
 * A fluorescent light fixture embedded in the floor.
 *
 * - Most (≈95 %) are permanently off — just a dark rectangular fixture.
 * - A few (≈5 %) randomly flicker every 10–30 seconds, briefly illuminating
 *   the surrounding area with a cold blue-white glow before fading back.
 */
export class FloorLight extends PIXI.Container {
  private glow: PIXI.Sprite;
  private fixture: PIXI.Graphics;

  // Flicker state machine
  private timer: number;
  private flickering = false;
  private flickerElapsed = 0;
  private readonly flickerDuration: number;
  private readonly canFlicker: boolean;

  constructor() {
    super();

    // ≈5 % functional; the rest are dead
    this.canFlicker = Math.random() < 0.05;
    this.timer = this.canFlicker ? 10 + Math.random() * 20 : Infinity;
    this.flickerDuration = 0.3 + Math.random() * 0.3;

    // Glow sprite (additive blended, starts invisible)
    this.glow = new PIXI.Sprite(getBarGlowTexture());
    this.glow.anchor.set(0.5);
    this.glow.blendMode = PIXI.BLEND_MODES.ADD;
    this.glow.tint = 0x88bbff;
    this.glow.alpha = 0;
    this.addChild(this.glow);

    // Physical fixture drawn on top of the glow
    this.fixture = new PIXI.Graphics();
    this.drawFixture(false);
    this.addChild(this.fixture);
  }

  // ── Drawing ──────────────────────────────────────────

  private drawFixture(active: boolean): void {
    const g = this.fixture;
    g.clear();

    // Dark fixture body
    g.beginFill(active ? 0x223344 : 0x111118);
    g.drawRoundedRect(-42, -4, 84, 8, 1);
    g.endFill();

    // End caps
    g.beginFill(active ? 0x445566 : 0x1a1a24);
    g.drawRect(-44, -4, 6, 8);
    g.drawRect(38, -4, 6, 8);
    g.endFill();

    // Diffuse strip glow on the fixture itself when lit
    if (active) {
      g.beginFill(0x88bbff, 0.15);
      g.drawRect(-38, -2, 76, 4);
      g.endFill();
    }
  }

  // ── Update ───────────────────────────────────────────

  /** `dt` in seconds. Call once per frame. */
  update(dt: number): void {
    if (!this.canFlicker) return;

    this.timer -= dt;

    // Start a flicker event
    if (this.timer <= 0 && !this.flickering) {
      this.flickering = true;
      this.flickerElapsed = 0;
    }

    if (!this.flickering) return;

    this.flickerElapsed += dt;
    const t = this.flickerElapsed / this.flickerDuration;

    let alpha = 0;

    if (t < 0.06) {
      // Sharp initial flash
      alpha = 0.3 + Math.random() * 0.5;
    } else if (t < 0.1) {
      // Drop
      alpha = 0.02;
    } else if (t < 0.14) {
      // Second flash
      alpha = 0.2 + Math.random() * 0.4;
    } else if (t < 0.18) {
      // Third sputter
      alpha = 0.05 + Math.random() * 0.15;
    } else if (t < 0.38) {
      // Sustained glow that decays
      const decay = 1 - (t - 0.18) / 0.2;
      alpha = 0.12 * Math.max(0, decay);
    } else if (t < 0.65 && Math.random() < 0.2) {
      // Occasional random sputters
      alpha = 0.03 + Math.random() * 0.1;
    } else if (t >= 0.65) {
      // Smooth fade to off
      alpha = Math.max(0, this.glow.alpha * 0.88);
    }

    this.glow.alpha = Math.min(1, alpha);
    this.drawFixture(this.glow.alpha > 0.02);

    // End flicker
    if (t >= 1) {
      this.flickering = false;
      this.glow.alpha = 0;
      this.drawFixture(false);
      this.timer = 10 + Math.random() * 20;
    }
  }
}
