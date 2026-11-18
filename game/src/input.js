// Keyboard + mouse state for Solmar Bay. The game polls this object each
// frame; edge-triggered actions (click, single key presses) are consumed
// through the `pressed` set, which the main loop clears at the end of
// every frame. Camera orbit comes from pointer drags, not pointer lock,
// so the game also works inside an iframe or a screenshot harness.

// Tracks held keys, single-press edges, drag deltas and click edges.
export class Input {
  constructor(target) {
    this.target = target || window;
    this.keys = new Set();
    this.pressed = new Set();
    this.dragX = 0;
    this.dragY = 0;
    this.mouseDown = false;
    this.clicked = false;
    this.wheel = 0;
    this._lastX = 0;
    this._lastY = 0;
    this._onKeyDown = (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      if (e.code === 'Space') e.preventDefault();
    };
    this._onKeyUp = (e) => this.keys.delete(e.code);
    this._onMouseDown = (e) => {
      this.mouseDown = true;
      this._lastX = e.clientX;
      this._lastY = e.clientY;
      if (e.button === 0) this.clicked = true;
    };
    this._onMouseUp = () => {
      this.mouseDown = false;
    };
    this._onMouseMove = (e) => {
      if (!this.mouseDown) return;
      this.dragX += e.clientX - this._lastX;
      this.dragY += e.clientY - this._lastY;
      this._lastX = e.clientX;
      this._lastY = e.clientY;
    };
    this._onBlur = () => {
      this.keys.clear();
      this.mouseDown = false;
    };
    this._onWheel = (e) => {
      this.wheel += e.deltaY;
    };
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    this.target.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('blur', this._onBlur);
    window.addEventListener('wheel', this._onWheel, { passive: true });
  }

  // Held right now?
  down(code) {
    return this.keys.has(code);
  }

  // Pressed since the last endFrame()?
  hit(code) {
    return this.pressed.has(code);
  }

  // Any of these movement keys held?
  get moveX() {
    const l = this.down('KeyA') || this.down('ArrowLeft') ? 1 : 0;
    const r = this.down('KeyD') || this.down('ArrowRight') ? 1 : 0;
    return r - l;
  }

  get moveY() {
    const f = this.down('KeyW') || this.down('ArrowUp') ? 1 : 0;
    const b = this.down('KeyS') || this.down('ArrowDown') ? 1 : 0;
    return f - b;
  }

  // Drain the accumulated drag since the last frame.
  takeDrag() {
    const d = { x: this.dragX, y: this.dragY };
    this.dragX = 0;
    this.dragY = 0;
    return d;
  }

  takeClick() {
    const c = this.clicked;
    this.clicked = false;
    return c;
  }

  takeWheel() {
    const w = this.wheel;
    this.wheel = 0;
    return w;
  }

  // Call once per frame after the game has read the edges.
  endFrame() {
    this.pressed.clear();
    this.clicked = false;
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    this.target.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mouseup', this._onMouseUp);
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('blur', this._onBlur);
    window.removeEventListener('wheel', this._onWheel);
  }
}
