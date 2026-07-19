import * as PIXI from 'pixi.js';
import type { CameraController } from '../camera/CameraController';

/**
 * Screen-space HUD rendered in a separate container not affected by the camera.
 */
export class HUDLayer extends PIXI.Container {
  private fpsText: PIXI.Text;
  private debugText: PIXI.Text;
  private frames = 0;
  private elapsed = 0;

  constructor() {
    super();

    this.fpsText = new PIXI.Text('', {
      fontFamily: 'monospace',
      fontSize: 11,
      fill: 0x666666,
    });
    this.fpsText.x = 12;
    this.fpsText.y = 10;
    this.addChild(this.fpsText);

    this.debugText = new PIXI.Text('', {
      fontFamily: 'monospace',
      fontSize: 10,
      fill: 0x555555,
    });
    this.debugText.x = 12;
    this.debugText.y = 26;
    this.addChild(this.debugText);
  }

  update(camera: CameraController, deltaMs: number): void {
    this.frames++;
    this.elapsed += deltaMs;
    if (this.elapsed >= 1000) {
      this.fpsText.text = `${this.frames} FPS`;
      this.frames = 0;
      this.elapsed -= 1000;
    }

    this.debugText.text = [
      `center: (${camera.centerWorldX.toFixed(0)}, ${camera.centerWorldY.toFixed(0)})`,
      `zoom: ${camera.zoom.toFixed(2)}`,
    ].join('  ');
  }
}
