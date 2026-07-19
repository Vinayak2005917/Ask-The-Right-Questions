import * as PIXI from 'pixi.js';

const DISPLAY_DURATION = 30000; // ms
const FADE_DURATION = 800;
const MAX_WIDTH = 400;
const PADDING = 14;
const BORDER_RADIUS = 10;

/**
 * A chat-bubble that appears near the central node, displays text,
 * then fades out after a few seconds and self-destructs.
 */
export class ChatBubble extends PIXI.Container {
  private bg: PIXI.Graphics;
  private textEl: PIXI.Text;
  private lifetime = 0;
  private done = false;
  readonly bubbleWidth: number;
  readonly bubbleHeight: number;

  constructor(text: string) {
    super();

    this.alpha = 0;

    this.textEl = new PIXI.Text(text, {
      fontFamily: "'Courier New', monospace",
      fontSize: 13,
      fill: 0xe0e0e0,
      wordWrap: true,
      wordWrapWidth: MAX_WIDTH - PADDING * 2,
      lineHeight: 18,
    });

    // Background bubble
    const bw = Math.min(this.textEl.width + PADDING * 2, MAX_WIDTH);
    const bh = this.textEl.height + PADDING * 2;

    this.bg = new PIXI.Graphics();
    this.bg.beginFill(0x1a1a2e, 0.92);
    this.bg.lineStyle(1.5, 0x8888cc, 0.6);
    this.bg.drawRoundedRect(0, 0, bw, bh, BORDER_RADIUS);
    this.bg.endFill();

    // Tiny arrow/pointer at bottom
    this.bg.beginFill(0x1a1a2e, 0.92);
    this.bg.moveTo(bw / 2 - 8, bh);
    this.bg.lineTo(bw / 2, bh + 10);
    this.bg.lineTo(bw / 2 + 8, bh);
    this.bg.closePath();
    this.bg.endFill();

    this.textEl.x = PADDING;
    this.textEl.y = PADDING;

    this.addChild(this.bg);
    this.addChild(this.textEl);

    this.bubbleWidth = bw;
    this.bubbleHeight = bh;
  }

  /** Call each frame. Returns true when fully faded and can be removed. */
  tick(deltaMs: number): boolean {
    if (this.done) return true;

    this.lifetime += deltaMs;

    // Fade in
    if (this.lifetime < 200) {
      this.alpha = this.lifetime / 200;
    } else {
      this.alpha = 1;
    }

    // Fade out
    if (this.lifetime > DISPLAY_DURATION - FADE_DURATION) {
      const fadeProgress = (this.lifetime - (DISPLAY_DURATION - FADE_DURATION)) / FADE_DURATION;
      this.alpha = Math.max(0, 1 - fadeProgress);

      // Slight upward drift during fade
      this.y -= 0.3;

      if (this.lifetime >= DISPLAY_DURATION) {
        this.done = true;
        return true;
      }
    }

    return false;
  }

  destroy(): void {
    super.destroy({ children: true });
  }
}
