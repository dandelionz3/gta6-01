// Keyboard + mouse state. One place owns every physical input so the game
// loop only ever asks "is this action held / was it just pressed".
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.down = new Set();
    this.pressed = new Set();   // consumed once per frame by the game loop
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouseHeld = false;
    this.clicked = false;       // a fresh left-click this frame
    this.dragging = false;
    this._lastX = 0;
    this._lastY = 0;
    this._bind();
  }

  _bind() {
    window.addEventListener("keydown", (e) => {
      if (e.code === "Space") e.preventDefault();
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    window.addEventListener("keyup", (e) => this.down.delete(e.code));
    window.addEventListener("blur", () => { this.down.clear(); this.mouseHeld = false; });
    this.canvas.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      this.mouseHeld = true;
      this.dragging = true;
      this.clicked = true;
      this._lastX = e.clientX;
      this._lastY = e.clientY;
    });
    window.addEventListener("mouseup", () => { this.mouseHeld = false; this.dragging = false; });
    window.addEventListener("mousemove", (e) => {
      if (!this.dragging) return;
      this.mouseDX += e.clientX - this._lastX;
      this.mouseDY += e.clientY - this._lastY;
      this._lastX = e.clientX;
      this._lastY = e.clientY;
    });
    // Touch: one finger drags the camera, tap fires.
    this.canvas.addEventListener("touchstart", (e) => {
      const t = e.touches[0];
      this._lastX = t.clientX; this._lastY = t.clientY;
      this.dragging = true;
    }, { passive: true });
    this.canvas.addEventListener("touchmove", (e) => {
      const t = e.touches[0];
      this.mouseDX += t.clientX - this._lastX;
      this.mouseDY += t.clientY - this._lastY;
      this._lastX = t.clientX; this._lastY = t.clientY;
    }, { passive: true });
    this.canvas.addEventListener("touchend", () => { this.dragging = false; });
  }

  held(code) { return this.down.has(code); }
  wasPressed(code) { return this.pressed.has(code); }
  // Call once at the end of each frame.
  endFrame() {
    this.pressed.clear();
    this.clicked = false;
    this.mouseDX = 0;
    this.mouseDY = 0;
  }
}
