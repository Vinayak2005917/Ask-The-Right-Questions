import * as PIXI from 'pixi.js';
import type { CameraController } from '../camera/CameraController';

export interface LightSource {
  /** World-space x */
  x: number;
  /** World-space y */
  y: number;
  /** World-space radius of the revealed area */
  radius: number;
}

// ── Shared gradient stops (pre-built so we don't re-create arrays every frame) ──
// Alpha-only stops used with destination-out compositing:
//   alpha=1 → fully removed (fully revealed / bright)
//   alpha=0 → not removed (full darkness)
const GRADIENT_STOPS: [number, number][] = [
  [0.0, 1.0],
  [0.2, 1.0],
  [0.4, 0.6],
  [0.6, 0.2],
  [0.8, 0.05],
  [1.0, 0.0],
];

/**
 * Screen-space darkness overlay with radial-gradient holes.
 *
 * The canvas is filled with a dark blue-black color, then `destination-out`
 * compositing cuts smooth circular holes at each light source's screen
 * position.  The result is drawn as a PIXI.Sprite above the world layer,
 * so only areas near memory/central nodes are illuminated.
 */
export class DarknessMask extends PIXI.Container {
  private sprite: PIXI.Sprite;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dpr: number;

  constructor(viewportW: number, viewportH: number) {
    super();
    this.dpr = window.devicePixelRatio || 1;

    this.canvas = document.createElement('canvas');
    this.canvas.width = viewportW * this.dpr;
    this.canvas.height = viewportH * this.dpr;
    this.ctx = this.canvas.getContext('2d')!;

    const texture = PIXI.Texture.from(this.canvas);
    this.sprite = new PIXI.Sprite(texture);
    this.sprite.width = viewportW;
    this.sprite.height = viewportH;
    this.addChild(this.sprite);
  }

  /**
   * Redraw the darkness mask for the current frame.
   * Call every tick from the main loop.
   */
  update(camera: CameraController, lights: LightSource[]): void {
    const ctx = this.ctx;
    const dpr = this.dpr;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // ── 1. Fill entire canvas with dark blue-black ────
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.82;
    ctx.fillStyle = '#050510';
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;

    // ── 2. Cut radial holes for each light source ────
    for (let i = 0; i < lights.length; i++) {
      const l = lights[i];

      // Project world position to screen-space
      const sx = (l.x * camera.zoom + camera.x) * dpr;
      const sy = (l.y * camera.zoom + camera.y) * dpr;
      const r = l.radius * camera.zoom * dpr;

      // Skip lights that are way off-screen
      if (sx + r < 0 || sx - r > w || sy + r < 0 || sy - r > h) continue;

      const gradient = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
      for (let si = 0; si < GRADIENT_STOPS.length; si++) {
        const [pos, alpha] = GRADIENT_STOPS[si];
        gradient.addColorStop(pos, `rgba(0,0,0,${alpha})`);
      }

      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalCompositeOperation = 'source-over';

    // ── 3. Notify PixiJS that the canvas contents changed ──
    this.sprite.texture.update();
  }

  /** Call when the viewport is resized. */
  resize(vw: number, vh: number): void {
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = vw * this.dpr;
    this.canvas.height = vh * this.dpr;
    this.sprite.width = vw;
    this.sprite.height = vh;
  }

  destroy(): void {
    this.sprite.destroy();
    super.destroy({ children: true });
  }
}
