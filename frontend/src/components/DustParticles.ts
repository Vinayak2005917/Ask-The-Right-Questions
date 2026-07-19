import * as PIXI from 'pixi.js';
import type { CameraController } from '../camera/CameraController';

// ── Shared 2×2 white dot texture ─────────────────────────────────────────

let _dotTexture: PIXI.Texture | null = null;

function getDotTexture(): PIXI.Texture {
  if (_dotTexture) return _dotTexture;

  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 2;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 2, 2);

  _dotTexture = PIXI.Texture.from(canvas);
  _dotTexture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
  return _dotTexture;
}

// ── Particle data ────────────────────────────────────────────────────────

interface Particle {
  x: number;
  y: number;
  /** Horizontal drift speed (world-units / sec) */
  vx: number;
  /** Vertical drift speed (world-units / sec) */
  vy: number;
  /** 1 or 2 (pixel size at 1× zoom) */
  size: number;
  /** Current alpha (0–1) */
  alpha: number;
  /** Alpha we are smoothly moving toward */
  alphaTarget: number;
  /** How fast alpha interpolates toward target (1/sec) */
  alphaSpeed: number;
  /** Parallax multiplier — lower = slower = feels farther away */
  layerSpeed: number;
  /** Sprite instance */
  sprite: PIXI.Sprite;
  /** Time since last alpha-target flip (seconds) */
  life: number;
}

// ── Muted gray-blue palette ──────────────────────────────────────────────

const COLORS = [0x7a8a9a, 0x8899aa, 0x778899, 0x6a7a8a, 0x8a9aaa, 0x7e8e9e];

// ── DustParticles ────────────────────────────────────────────────────────

/**
 * World-space ambient dust particle system.
 *
 * Renders tiny 1–2 px dots that drift slowly with parallax, creating the
 * feeling of old dust suspended in the air.  Particles are spawned within
 * the visible world area (plus a margin) and respawn on the opposite side
 * when they drift out of view.
 *
 * Must be placed in the **world layer** (camera-transformed).  The intended
 * place in the scene graph is above the darkness overlay but below gameplay
 * nodes so the dust appears to float *in* the environment.
 *
 * ```text
 * worldLayer
 *   ├── BackgroundRenderer
 *   ├── Darkness Overlay
 *   ├── DustParticles        ← here
 *   ├── FloorLight[]
 *   ├── LightManager
 *   ├── ConnectionLines
 *   ├── CentralNode
 *   └── …
 * ```
 */
export class DustParticles extends PIXI.Container {
  private particles: Particle[] = [];
  private texture: PIXI.Texture;
  private spawnBounds = { x: 0, y: 0, w: 800, h: 600 };

  constructor() {
    super();
    this.eventMode = 'none';
    this.texture = getDotTexture();
  }

  // ── Public API ───────────────────────────────────────────────────────

  /**
   * Call every frame from the application ticker.
   * @param camera  Provides visible-world bounds and current zoom.
   * @param dtSec   Delta time in seconds.
   */
  update(camera: CameraController, dtSec: number): void {
    // Determine the visible world region (with generous margin so particles
    // drift in from off-screen instead of popping at the edge).
    const [left, top, right, bottom] = camera.getVisibleBounds();
    const margin = 300;
    this.spawnBounds = {
      x: left - margin,
      y: top - margin,
      w: right - left + margin * 2,
      h: bottom - top + margin * 2,
    };

    // Scale particle count with zoom — more visible at closer ranges.
    const zoom = camera.zoom;
    const targetCount = Math.floor(120 + 280 * Math.min(1, zoom / 1.5));

    // Spawn or cull to reach targetCount
    while (this.particles.length < targetCount) {
      this.spawnParticle();
    }
    while (this.particles.length > targetCount) {
      const p = this.particles.pop()!;
      this.removeChild(p.sprite);
      p.sprite.destroy();
    }

    // Update every particle
    const sb = this.spawnBounds;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];

      // Drift (parallax-multiplied)
      p.x += p.vx * dtSec * p.layerSpeed;
      p.y += p.vy * dtSec * p.layerSpeed;

      // Smooth alpha interpolation toward target
      p.alpha += (p.alphaTarget - p.alpha) * dtSec * p.alphaSpeed;

      // Periodically choose a new alpha target (fade in / fade out behaviour)
      p.life += dtSec;
      if (Math.abs(p.alpha - p.alphaTarget) < 0.005 && p.life > 3) {
        // New target between 0.10 and 0.25, or occasionally 0 (complete fade-out)
        p.alphaTarget = Math.random() < 0.20 ? 0 : 0.10 + Math.random() * 0.15;
        p.alphaSpeed = 0.3 + Math.random() * 0.8;
        p.life = 0;
      }

      // Clamp & apply
      p.alpha = Math.max(0, Math.min(1, p.alpha));
      p.sprite.x = p.x;
      p.sprite.y = p.y;
      p.sprite.alpha = p.alpha;
      p.sprite.scale.set(p.size);

      // Respawn if it drifted out of the spawn window
      if (
        p.x < sb.x - 100 ||
        p.x > sb.x + sb.w + 100 ||
        p.y < sb.y - 100 ||
        p.y > sb.y + sb.h + 100
      ) {
        this.respawnParticle(p);
      }
    }
  }

  /** Release all GPU resources. */
  destroy(): void {
    for (const p of this.particles) {
      p.sprite.destroy();
    }
    this.particles = [];
    // Texture is shared — do not destroy it here.
    super.destroy();
  }

  // ── Internal helpers ──────────────────────────────────────────────────

  private spawnParticle(): void {
    const sb = this.spawnBounds;
    const size = Math.random() < 0.7 ? 1 : 2;

    const p: Particle = {
      x: sb.x + Math.random() * sb.w,
      y: sb.y + Math.random() * sb.h,
      vx: (Math.random() - 0.5) * 6,
      vy: (Math.random() - 0.5) * 5 + 1.5, // slight downward bias
      size,
      alpha: 0,
      alphaTarget: 0.10 + Math.random() * 0.15,
      alphaSpeed: 0.5 + Math.random() * 1.5,
      layerSpeed: 0.4 + Math.random() * 0.8,
      sprite: new PIXI.Sprite(this.texture),
      life: Math.random() * 5,
    };

    p.sprite.anchor.set(0.5);
    p.sprite.tint = COLORS[Math.floor(Math.random() * COLORS.length)];
    p.sprite.alpha = 0;
    p.sprite.scale.set(size);
    p.sprite.x = p.x;
    p.sprite.y = p.y;

    this.addChild(p.sprite);
    this.particles.push(p);
  }

  private respawnParticle(p: Particle): void {
    const sb = this.spawnBounds;
    p.x = sb.x + Math.random() * sb.w;
    p.y = sb.y + Math.random() * sb.h;
    p.vx = (Math.random() - 0.5) * 6;
    p.vy = (Math.random() - 0.5) * 5 + 1.5;
    p.alpha = 0;
    p.alphaTarget = 0.10 + Math.random() * 0.15;
    p.alphaSpeed = 0.5 + Math.random() * 1.5;
    p.life = 0;
  }
}
