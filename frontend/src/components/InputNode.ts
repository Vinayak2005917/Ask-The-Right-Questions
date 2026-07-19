import * as PIXI from 'pixi.js';

const WIDTH = 240;
const HEIGHT = 32;
const BG_COLOR = 0x222222;
const BORDER_COLOR = 0x555555;
const TEXT_COLOR = 0xcccccc;
const PLACEHOLDER_COLOR = 0x666666;
const CARET_COLOR = 0x888888;

export interface InputNodeOptions {
  onSubmit: (text: string) => void;
  placeholder?: string;
}

/**
 * A Pixi-based text input that lives in the world space.
 *
 * Uses keyboard DOM events while focused. Renders text, caret, and
 * placeholder entirely with PIXI primitives — no HTML overlays.
 */
export class InputNode extends PIXI.Container {
  private bg: PIXI.Graphics;
  private textDisplay: PIXI.Text;
  private placeholderDisplay: PIXI.Text;
  private caret: PIXI.Graphics;
  private _value = '';
  private _focused = false;
  private blinkPhase = 0;
  private onSubmit: (text: string) => void;

  private keyHandler: ((e: KeyboardEvent) => void) | null = null;
  private focusBound: (() => void) | null = null;

  constructor(opts: InputNodeOptions) {
    super();
    this.onSubmit = opts.onSubmit;
    this.eventMode = 'static';
    this.cursor = 'text';

    this.bg = new PIXI.Graphics();
    this.addChild(this.bg);

    this.placeholderDisplay = new PIXI.Text(opts.placeholder ?? 'Ask the right questions', {
      fontFamily: "'Courier New', monospace",
      fontSize: 13,
      fill: PLACEHOLDER_COLOR,
    });
    this.placeholderDisplay.x = 12;
    this.placeholderDisplay.y = HEIGHT / 2;
    this.placeholderDisplay.anchor.set(0, 0.5);
    this.addChild(this.placeholderDisplay);

    this.textDisplay = new PIXI.Text('', {
      fontFamily: "'Courier New', monospace",
      fontSize: 13,
      fill: TEXT_COLOR,
    });
    this.textDisplay.x = 12;
    this.textDisplay.y = HEIGHT / 2;
    this.textDisplay.anchor.set(0, 0.5);
    this.addChild(this.textDisplay);

    this.caret = new PIXI.Graphics();
    this.addChild(this.caret);

    this.drawBg();

    this.on('pointerdown', this.handleFocus);
  }

  get value(): string { return this._value; }
  get focused(): boolean { return this._focused; }

  focus(): void {
    if (this._focused) return;
    this._focused = true;
    this.addKeyboardListeners();
    this.drawBg();
  }

  blur(): void {
    if (!this._focused) return;
    this._focused = false;
    this.removeKeyboardListeners();
    this.drawBg();
  }

  /** Called each frame from ticker for caret blink. */
  tick(deltaMs: number): void {
    if (!this._focused) {
      this.caret.visible = false;
      return;
    }
    this.blinkPhase += deltaMs;
    this.caret.visible = Math.floor(this.blinkPhase / 500) % 2 === 0;
    this.updateCaretPos();
  }

  destroy(): void {
    this.blur();
    this.off('pointerdown', this.handleFocus);
    super.destroy({ children: true });
  }

  private handleFocus = (): void => {
    this.focus();
  };

  private addKeyboardListeners(): void {
    this.keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const val = this._value.trim();
        if (val) {
          this.onSubmit(val);
          this._value = '';
          this.renderText();
        }
        return;
      }
      if (e.key === 'Backspace') {
        e.preventDefault();
        this._value = this._value.slice(0, -1);
        this.renderText();
        return;
      }
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        this._value += e.key;
        this.renderText();
      }
    };
    window.addEventListener('keydown', this.keyHandler);

    // Blur on click outside
    this.focusBound = (): void => {
      // Will be handled by pointerdown check on the app stage
    };
    setTimeout(() => {
      window.addEventListener('pointerdown', this.handleOutsideClick);
    });
  }

  private handleOutsideClick = (_e: PointerEvent): void => {
    // Unused — World handles blur via stage pointerdown
  };

  /** To be called by World when a pointerdown happens on the stage. */
  handleStagePointerDown(target: PIXI.DisplayObject): void {
    if (!this._focused || target === this) return;
    // Walk up the display list to see if target is a descendant
    let node: PIXI.DisplayObject | null = target;
    while (node) {
      if (node === this) return;
      node = node.parent;
    }
    this.blur();
  }

  private removeKeyboardListeners(): void {
    if (this.keyHandler) {
      window.removeEventListener('keydown', this.keyHandler);
      this.keyHandler = null;
    }
    if (this.focusBound) {
      window.removeEventListener('pointerdown', this.handleOutsideClick);
      this.focusBound = null;
    }
  }

  private renderText(): void {
    this.textDisplay.text = this._value;
    this.placeholderDisplay.visible = this._value.length === 0;
    this.updateCaretPos();
  }

  private updateCaretPos(): void {
    const textWidth = this.textDisplay.width;
    this.caret.clear();
    if (this._focused) {
      this.caret.beginFill(CARET_COLOR, 0.8);
      this.caret.drawRect(12 + textWidth + 1, (HEIGHT - 14) / 2, 1, 14);
      this.caret.endFill();
    }
  }

  private drawBg(): void {
    const g = this.bg;
    g.clear();
    g.beginFill(BG_COLOR, 0.88);
    g.drawRoundedRect(0, 0, WIDTH, HEIGHT, 4);
    g.endFill();

    g.lineStyle(1, BORDER_COLOR, this._focused ? 0.6 : 0.3);
    g.drawRoundedRect(0, 0, WIDTH, HEIGHT, 4);

    // Bottom glow line
    g.lineStyle(1, BORDER_COLOR, 0.15);
    g.moveTo(WIDTH * 0.1, HEIGHT);
    g.lineTo(WIDTH * 0.9, HEIGHT);

    // Prompt symbol
    const prompt = new PIXI.Text('>', {
      fontFamily: "'Courier New', monospace",
      fontSize: 13,
      fill: BORDER_COLOR,
    });
    prompt.alpha = 0.6;
    prompt.x = -18;
    prompt.y = HEIGHT / 2;
    prompt.anchor.set(0, 0.5);
    this.addChild(prompt);
  }
}
