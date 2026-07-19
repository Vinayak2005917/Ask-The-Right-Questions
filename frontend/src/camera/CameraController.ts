import * as PIXI from 'pixi.js';

export interface PanBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface CameraConfig {
  viewWidth: number;
  viewHeight: number;
  minZoom?: number;
  maxZoom?: number;
  panBounds?: PanBounds | null;
}

const DEFAULT_LERP = 0.09;

/**
 * Camera controller.
 *
 * - Single source of truth: (x, y, zoom) on the container.
 * - Drag is 1:1 pixel mapping — no division by zoom, no drift.
 * - Zoom is cursor-centered: the world point under the cursor stays fixed.
 * - `goTo()` provides frame-rate–independent smooth animation.
 */
export class CameraController {
  
  private clampPan(): void {
    if (!this.panBounds) return;
    const { left, top, right, bottom } = this.panBounds;
    const z = this._zoom;
    const margin = 50; // px of empty space allowed beyond the bounds

    // World→screen: sx = wx * z + cx
    // left edge must be ≤ viewWidth - margin  →  left * z + cx ≤ viewWidth - margin  →  cx ≤ viewWidth - margin - left * z
    // right edge must be ≥ margin             →  right * z + cx ≥ margin            →  cx ≥ margin - right * z
    const cxMin = margin - right * z;
    const cxMax = this.viewWidth - margin - left * z;
    if (cxMin > cxMax) {
      // World fits entirely in viewport → center horizontally
      this._x = Math.round((cxMin + cxMax) / 2);
    } else {
      this._x = Math.round(Math.max(cxMin, Math.min(cxMax, this._x)));
    }

    const cyMin = margin - bottom * z;
    const cyMax = this.viewHeight - margin - top * z;
    if (cyMin > cyMax) {
      this._y = Math.round((cyMin + cyMax) / 2);
    } else {
      this._y = Math.round(Math.max(cyMin, Math.min(cyMax, this._y)));
    }
  }
  // ── SSOT: applied to container transform ──────────────
  private _x = 0;
  private _y = 0;
  private _zoom = 1;
  private readonly minZoom: number;
  private readonly maxZoom: number;
  private readonly panBounds: PanBounds | null;
  private viewWidth: number;
  private viewHeight: number;

  // ── Drag state ────────────────────────────────────────
  private _pointerDown = false;
  private _dragging = false;
  private dragStartScreenX = 0;
  private dragStartScreenY = 0;
  private dragStartCamX = 0;
  private dragStartCamY = 0;

  // ── Smooth animation ──────────────────────────────────
  private animTargetX = 0;
  private animTargetY = 0;
  private animTargetZoom = 1;
  private _animating = false;
  private lerpSpeed = DEFAULT_LERP;

  private readonly container: PIXI.Container;
  private ticker?: PIXI.Ticker;
  private tickerFn?: () => void;

  constructor(container: PIXI.Container, config: CameraConfig) {
    this.container = container;
    this.viewWidth = config.viewWidth;
    this.viewHeight = config.viewHeight;
    this.minZoom = config.minZoom ?? 0.01;
    this.maxZoom = config.maxZoom ?? 1;
    this.panBounds = config.panBounds ?? null;
  }

  // ── Lifecycle ─────────────────────────────────────────

  attachTicker(ticker: PIXI.Ticker): void {
    this.detachTicker();
    this.ticker = ticker;
    this.tickerFn = () => this.tick(ticker.deltaMS / 1000);
    ticker.add(this.tickerFn);
  }

  detachTicker(): void {
    if (this.ticker && this.tickerFn) {
      this.ticker.remove(this.tickerFn);
    }
    this.ticker = undefined;
    this.tickerFn = undefined;
  }

  resize(w: number, h: number): void {
    this.viewWidth = w;
    this.viewHeight = h;
  }

  // ── Public API ────────────────────────────────────────

  get x(): number { return this._x; }
  get y(): number { return this._y; }
  get zoom(): number { return this._zoom; }
  /** World-coordinate point at the center of the viewport. */
  get centerWorldX(): number { return (this.viewWidth / 2 - this._x) / this._zoom; }
  get centerWorldY(): number { return (this.viewHeight / 2 - this._y) / this._zoom; }
  get isDragging(): boolean { return this._dragging; }
  get isAnimating(): boolean { return this._animating; }

  /** Animate the camera so (wx, wy) is at viewport center at the given zoom. */
  goTo(wx: number, wy: number, zoom: number): void {
    const z = Math.max(this.minZoom, Math.min(this.maxZoom, zoom));
    let tx = Math.round(this.viewWidth / 2 - wx * z);
    let ty = Math.round(this.viewHeight / 2 - wy * z);
    // Clamp animation targets to pan bounds
    if (this.panBounds) {
      const { left, top, right, bottom } = this.panBounds;
      const margin = 50;
      const cxMin = margin - right * z;
      const cxMax = this.viewWidth - margin - left * z;
      tx = cxMin > cxMax
        ? Math.round((cxMin + cxMax) / 2)
        : Math.round(Math.max(cxMin, Math.min(cxMax, tx)));
      const cyMin = margin - bottom * z;
      const cyMax = this.viewHeight - margin - top * z;
      ty = cyMin > cyMax
        ? Math.round((cyMin + cyMax) / 2)
        : Math.round(Math.max(cyMin, Math.min(cyMax, ty)));
    }
    this.animTargetX = tx;
    this.animTargetY = ty;
    this.animTargetZoom = z;
    this._animating = true;
  }

  /** Instantly snap to current animation target. */
  snap(): void {
    if (!this._animating) return;
    this._x = this.animTargetX;
    this._y = this.animTargetY;
    this._zoom = this.animTargetZoom;
    this._animating = false;
    this.clampPan();
    this.apply();
  }

  /** Center on (0,0) at zoom=1. */
  resetView(): void {
    this._animating = false;
    this._x = Math.round(this.viewWidth / 2);
    this._y = Math.round(this.viewHeight / 2);
    this._zoom = 1;
    this.clampPan();
    this.apply();
  }

  // ── Input: Drag (1:1 screen-pixel mapping, no drift) ──

  onPointerDown(screenX: number, screenY: number): void {
    this._pointerDown = true;
    this.dragStartScreenX = screenX;
    this.dragStartScreenY = screenY;
    this.dragStartCamX = this._x;
    this.dragStartCamY = this._y;
    this._animating = false;
  }

  onPointerMove(screenX: number, screenY: number): void {
    if (!this._pointerDown) return;
    const dx = screenX - this.dragStartScreenX;
    const dy = screenY - this.dragStartScreenY;
    if (!this._dragging) {
      if (dx * dx + dy * dy > 9) {
        this._dragging = true;
      } else {
        return;
      }
    }
    this._x = Math.round(this.dragStartCamX + dx);
    this._y = Math.round(this.dragStartCamY + dy);
    this.clampPan();
    this.apply();
  }

  onPointerUp(): void {
    this._pointerDown = false;
    this._dragging = false;
  }

  // ── Input: Zoom (cursor-centered) ─────────────────────

  onWheel(screenX: number, screenY: number, deltaY: number): void {
    const oldZoom = this._zoom;
    const factor = deltaY > 0 ? 1 / 1.12 : 1.12;
    const newZoom = Math.max(this.minZoom, Math.min(this.maxZoom, oldZoom * factor));

    // World point under cursor before zoom
    const wx = (screenX - this._x) / oldZoom;
    const wy = (screenY - this._y) / oldZoom;

    // After zoom, position camera so same world point is under cursor
    this._x = Math.round(screenX - wx * newZoom);
    this._y = Math.round(screenY - wy * newZoom);
    this._zoom = newZoom;
    this._animating = false;
    this.clampPan();
    this.apply();
  }

  // ── Coordinate transforms ─────────────────────────────

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return {
      x: (sx - this._x) / this._zoom,
      y: (sy - this._y) / this._zoom,
    };
  }

  worldToScreen(wx: number, wy: number): { x: number; y: number } {
    return { x: wx * this._zoom + this._x, y: wy * this._zoom + this._y };
  }

  /** Visible world bounds as [left, top, right, bottom]. */
  getVisibleBounds(): [number, number, number, number] {
    return [
      (0 - this._x) / this._zoom,
      (0 - this._y) / this._zoom,
      (this.viewWidth - this._x) / this._zoom,
      (this.viewHeight - this._y) / this._zoom,
    ];
  }

  // ── Internal ──────────────────────────────────────────

  private tick(dt: number): void {
    if (!this._animating) return;

    const t = 1 - Math.pow(1 - this.lerpSpeed, dt * 60);
    this._x += (this.animTargetX - this._x) * t;
    this._y += (this.animTargetY - this._y) * t;
    this._zoom += (this.animTargetZoom - this._zoom) * t;

    if (
      Math.abs(this._x - this.animTargetX) < 0.5 &&
      Math.abs(this._y - this.animTargetY) < 0.5 &&
      Math.abs(this._zoom - this.animTargetZoom) < 0.001
    ) {
      this._x = this.animTargetX;
      this._y = this.animTargetY;
      this._zoom = this.animTargetZoom;
      this._animating = false;
    }
    this.clampPan();
    this.apply();
  }

  private apply(): void {
    // Snap to whole pixels so textures are never rendered at fractional positions
    this.container.position.set(Math.round(this._x), Math.round(this._y));
    this.container.scale.set(this._zoom);
  }
}
