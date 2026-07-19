import * as PIXI from 'pixi.js';
import type { CameraController } from '../camera/CameraController';

const MINOR_STEP = 50;
const MAJOR_STEP = 250;
const TILE_SCALE = 3; // 3× larger per tile to reduce repetition frequency

const TILE_SIZE = 16; // each tile_type_*.png is 16×16
const MEGATILE_GRID = 64; // 64×64 tiles per megatile → 1024×1024 px canvas

/**
 * Renders either an infinite procedural grid or a randomly-tiled background in world-space.
 *
 * - Grid mode: draws only grid lines that fall within the current viewport.
 * - Image mode: tiles a randomly-arranged "megatile" (composited from all .png
 *   images in src/assets/tiles/) across the world, moving with the camera.
 *   Drop new tile images into that folder and they'll be picked up automatically.
 */
interface TileCell {
  imageIndex: number;
  dark: boolean;
  /** 0-3: number of 90° clockwise rotations */
  rotation: number;
}

export class BackgroundRenderer extends PIXI.Container {
  private gridGfx: PIXI.Graphics;
  private bgSprite: PIXI.TilingSprite;
  private _gridVisible: boolean = true;
  private worldSize = 10000;
  private _darkFrequency: number = 0.12;
  /** Incremented on each texture regeneration so pending tryAgain callbacks can bail out. */
  private textureGeneration = 0;

  constructor() {
    super();

    // ── Randomly-tiled background ───────────────────────
    this.bgSprite = new PIXI.TilingSprite(
      PIXI.Texture.EMPTY,
      this.worldSize,
      this.worldSize,
    );
    this.bgSprite.tileScale.set(TILE_SCALE);
    // Center the sprite on the world origin so it extends
    // from (-5000, -5000) to (5000, 5000) in world-space.
    this.bgSprite.x = -this.worldSize / 2;
    this.bgSprite.y = -this.worldSize / 2;
    this.bgSprite.visible = false;

    // Generate the initial megatile texture
    this.textureGeneration++;
    this.bgSprite.texture = BackgroundRenderer.generateMegatileTexture(this._darkFrequency, this.textureGeneration);

    // ── Grid graphics ───────────────────────────────────
    this.gridGfx = new PIXI.Graphics();

    this.addChild(this.bgSprite);
    this.addChild(this.gridGfx);
  }

  /** Whether the grid is visible. When false, the tiled background image is shown. */
  set gridVisible(v: boolean) {
    this._gridVisible = v;
    this.gridGfx.visible = v;
    this.bgSprite.visible = !v;
  }

  get gridVisible(): boolean {
    return this._gridVisible;
  }

  /** Update tile scale at runtime (1 = 16px, 3 = 48px, etc.) */
  setTileScale(scale: number): void {
    this.bgSprite.tileScale.set(scale);
  }

  /**
   * Change the dark-tile frequency and regenerate the megatile texture.
   * @param freq 0–1 value (e.g. 0.12 = 12 % chance per tile)
   */
  setDarkFrequency(freq: number): void {
    this._darkFrequency = freq;
    this.textureGeneration++;
    // Destroy the old texture so it doesn't leak
    const oldTex = this.bgSprite.texture;
    this.bgSprite.texture = BackgroundRenderer.generateMegatileTexture(freq, this.textureGeneration);
    if (oldTex !== PIXI.Texture.EMPTY) {
      oldTex.destroy(true);
    }
  }

  /** Redraw the visible portion of the grid / update the tiled background. Call each frame from the ticker. */
  update(camera: CameraController): void {
    const [left, top, right, bottom] = camera.getVisibleBounds();

    if (this._gridVisible) {
      this.drawGrid(left, top, right, bottom);
    } else {
      this.bgSprite.tilePosition.x = Math.round(this.bgSprite.tilePosition.x);
      this.bgSprite.tilePosition.y = Math.round(this.bgSprite.tilePosition.y);
    }
  }

  // ── Random megatile texture ─────────────────────────

  /**
   * Pick a random tile index using weighted probabilities.
   * Weights are generated once per session — some tiles end up naturally
   * more common than others.
   */
  private static weightedPick(weights: number[]): number {
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r <= 0) return i;
    }
    return weights.length - 1;
  }

  /**
   * Build a tile-able canvas texture from all .png files in
   * src/assets/tiles/.
   *
   * - Tiles are **weighted** so some types appear more frequently.
   * - A few tiles (controlled by `darkFreq`) are darkened; neighbours
   *   of a dark tile catch a weaker dark spill.
   *
   * Any .png dropped into src/assets/tiles/ is automatically included.
   */
  private static generateMegatileTexture(darkFreq: number, generation?: number): PIXI.Texture {
    const tileModules = import.meta.glob<{ default: string }>(
      '/src/assets/tiles/*.png',
      { eager: true, query: '?url' },
    );
    const urls = Object.values(tileModules).map((m) => m.default);

    // Fallback if no tiles found
    if (urls.length === 0) {
      const fb = document.createElement('canvas');
      fb.width = 1;
      fb.height = 1;
      const tex = PIXI.Texture.from(fb);
      tex.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
      return tex;
    }

    const nTiles = urls.length;
    const images = urls.map((url) => {
      const img = new Image();
      img.src = url;
      return img;
    });

    // ── Per-session weights ────────────────────────────
    const weights: number[] = [];
    for (let i = 0; i < nTiles; i++) {
      weights.push(0.3 + Math.random() * 1.0);
    }
    const boostedIdx = Math.floor(Math.random() * nTiles);
    weights[boostedIdx] = 2.0 + Math.random() * 2.0;

    // ── Plan each cell ─────────────────────────────────
    const cells: TileCell[] = [];
    for (let i = 0; i < MEGATILE_GRID * MEGATILE_GRID; i++) {
      cells.push({
        imageIndex: BackgroundRenderer.weightedPick(weights),
        dark: Math.random() < darkFreq,
        // ~25% chance of a 90° rotation to add subtle variation
        rotation: Math.random() < 0.25 ? Math.floor(Math.random() * 4) : 0,
      });
    }

    // ── Dark propagation ───────────────────────────────
    // dark tile → 0.55 alpha overlay; neighbour → 0.20
    const darkenAmount: number[][] = [];
    for (let gy = 0; gy < MEGATILE_GRID; gy++) {
      darkenAmount[gy] = [];
      for (let gx = 0; gx < MEGATILE_GRID; gx++) {
        const idx = gy * MEGATILE_GRID + gx;
        if (cells[idx].dark) {
          darkenAmount[gy][gx] = 0.55;
        } else {
          let hasDarkNeighbor = false;
          for (let dy = -1; dy <= 1 && !hasDarkNeighbor; dy++) {
            for (let dx = -1; dx <= 1 && !hasDarkNeighbor; dx++) {
              if (dx === 0 && dy === 0) continue;
              const ny = gy + dy;
              const nx = gx + dx;
              if (
                ny >= 0 && ny < MEGATILE_GRID &&
                nx >= 0 && nx < MEGATILE_GRID &&
                cells[ny * MEGATILE_GRID + nx].dark
              ) {
                hasDarkNeighbor = true;
              }
            }
          }
          darkenAmount[gy][gx] = hasDarkNeighbor ? 0.20 : 0;
        }
      }
    }

    const megW = TILE_SIZE * MEGATILE_GRID;
    const megH = TILE_SIZE * MEGATILE_GRID;
    const canvas = document.createElement('canvas');
    canvas.width = megW;
    canvas.height = megH;
    const ctx = canvas.getContext('2d')!;

    const fallbackColors = ['#3a3a3a', '#2e2e2e', '#454545', '#505050', '#252525'];

    // ── Draw each cell at normal 1× size ─────────────
    for (let gy = 0; gy < MEGATILE_GRID; gy++) {
      for (let gx = 0; gx < MEGATILE_GRID; gx++) {
        const idx = gy * MEGATILE_GRID + gx;
        const { imageIndex } = cells[idx];
        const img = images[imageIndex];
        const cellX = gx * TILE_SIZE;
        const cellY = gy * TILE_SIZE;

        if (img.complete && img.naturalWidth > 0) {
          const rot = cells[idx].rotation;
          if (rot === 0) {
            ctx.drawImage(img, cellX, cellY, TILE_SIZE, TILE_SIZE);
          } else {
            ctx.save();
            ctx.translate(cellX + TILE_SIZE / 2, cellY + TILE_SIZE / 2);
            ctx.rotate((rot * Math.PI) / 2);
            ctx.drawImage(img, -TILE_SIZE / 2, -TILE_SIZE / 2, TILE_SIZE, TILE_SIZE);
            ctx.restore();
          }
        } else {
          ctx.fillStyle = fallbackColors[imageIndex % fallbackColors.length];
          ctx.fillRect(cellX, cellY, TILE_SIZE, TILE_SIZE);
        }
      }
    }

    // ── Dark overlays (on top of all images) ─────────
    for (let gy = 0; gy < MEGATILE_GRID; gy++) {
      for (let gx = 0; gx < MEGATILE_GRID; gx++) {
        const amt = darkenAmount[gy][gx];
        if (amt > 0) {
          ctx.fillStyle = `rgba(0,0,0,${amt})`;
          ctx.fillRect(gx * TILE_SIZE, gy * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }
      }
    }

    const texture = PIXI.Texture.from(canvas);
    texture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;

    // Retry if any image was still loading
    const anyMissing = images.some((img) => !img.complete || img.naturalWidth === 0);
    if (anyMissing) {
      const genOnCreate = generation;
      const tryAgain = () => {
        // If the generation has changed, this texture was superceded — bail out
        if (generation !== undefined && genOnCreate !== generation) return;
        if (images.every((img) => img.complete && img.naturalWidth > 0)) {
          ctx.clearRect(0, 0, megW, megH);
          for (let gy = 0; gy < MEGATILE_GRID; gy++) {
            for (let gx = 0; gx < MEGATILE_GRID; gx++) {
              const idx = gy * MEGATILE_GRID + gx;
              const { imageIndex, rotation } = cells[idx];
              const cx = gx * TILE_SIZE;
              const cy = gy * TILE_SIZE;
              if (rotation === 0) {
                ctx.drawImage(images[imageIndex], cx, cy, TILE_SIZE, TILE_SIZE);
              } else {
                ctx.save();
                ctx.translate(cx + TILE_SIZE / 2, cy + TILE_SIZE / 2);
                ctx.rotate((rotation * Math.PI) / 2);
                ctx.drawImage(images[imageIndex], -TILE_SIZE / 2, -TILE_SIZE / 2, TILE_SIZE, TILE_SIZE);
                ctx.restore();
              }
            }
          }
          for (let gy = 0; gy < MEGATILE_GRID; gy++) {
            for (let gx = 0; gx < MEGATILE_GRID; gx++) {
              const amt = darkenAmount[gy][gx];
              if (amt > 0) {
                ctx.fillStyle = `rgba(0,0,0,${amt})`;
                ctx.fillRect(gx * TILE_SIZE, gy * TILE_SIZE, TILE_SIZE, TILE_SIZE);
              }
            }
          }
          // Guard: only update if the base texture is still alive (wasn't destroyed by a newer generation)
          if (texture.baseTexture && texture.baseTexture.resource) {
            texture.update();
          }
        } else {
          requestAnimationFrame(tryAgain);
        }
      };
      requestAnimationFrame(tryAgain);
    }

    return texture;
  }

  // ── Grid drawing ─────────────────────────────────────

  // ── Grid drawing ─────────────────────────────────────

  private drawGrid(left: number, top: number, right: number, bottom: number): void {
    const g = this.gridGfx;
    g.clear();

    // Minor grid
    const mStartX = Math.floor(left / MINOR_STEP) * MINOR_STEP;
    const mStartY = Math.floor(top / MINOR_STEP) * MINOR_STEP;
    g.lineStyle(1, 0x333333, 0.35);
    for (let x = mStartX; x <= right; x += MINOR_STEP) {
      if (x % MAJOR_STEP === 0) continue;
      g.moveTo(x, top);
      g.lineTo(x, bottom);
    }
    for (let y = mStartY; y <= bottom; y += MINOR_STEP) {
      if (y % MAJOR_STEP === 0) continue;
      g.moveTo(left, y);
      g.lineTo(right, y);
    }

    // Major grid
    const MStartX = Math.floor(left / MAJOR_STEP) * MAJOR_STEP;
    const MStartY = Math.floor(top / MAJOR_STEP) * MAJOR_STEP;
    g.lineStyle(1, 0x4a4a4a, 0.5);
    for (let x = MStartX; x <= right; x += MAJOR_STEP) {
      g.moveTo(x, top);
      g.lineTo(x, bottom);
    }
    for (let y = MStartY; y <= bottom; y += MAJOR_STEP) {
      g.moveTo(left, y);
      g.lineTo(right, y);
    }

    // Axes (origin lines) — subtle highlight
    if (left <= 0 && right >= 0) {
      g.lineStyle(1, 0x666666, 0.2);
      g.moveTo(0, top);
      g.lineTo(0, bottom);
    }
    if (top <= 0 && bottom >= 0) {
      g.lineStyle(1, 0x666666, 0.2);
      g.moveTo(left, 0);
      g.lineTo(right, 0);
    }
  }

}
