import * as PIXI from 'pixi.js';
import { PointLight } from './PointLight';

/**
 * Manages all point lights in the world.
 *
 * Sits in `worldLayer` between the darkness overlay and the gameplay nodes,
 * so glows appear above the dimmed background but **behind** the nodes
 * and connection lines.
 */
export class LightManager extends PIXI.Container {
  private lights: PointLight[] = [];

  constructor() {
    super();
  }

  /** Add a light (already positioned at its target's world coordinates). */
  addLight(light: PointLight): void {
    this.lights.push(light);
    this.addChild(light);
  }

  /** Remove a specific light. */
  removeLight(light: PointLight): void {
    const idx = this.lights.indexOf(light);
    if (idx !== -1) {
      this.lights.splice(idx, 1);
      this.removeChild(light);
    }
  }

  /** Remove and destroy all lights. */
  clear(): void {
    for (let i = this.lights.length - 1; i >= 0; i--) {
      const l = this.lights[i];
      this.removeChild(l);
      l.destroy();
    }
    this.lights = [];
  }

  /** Total number of active lights. */
  get count(): number {
    return this.lights.length;
  }

  /** Call every frame. `deltaMs` in milliseconds. */
  tick(deltaMs: number): void {
    const dt = deltaMs / 1000;
    for (let i = 0; i < this.lights.length; i++) {
      this.lights[i].update(dt);
    }
  }
}
