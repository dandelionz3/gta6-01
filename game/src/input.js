// Keyboard + mouse state for Solmar Bay.
// The game polls this object every frame; nothing here knows about
// cars, missions or the HUD — it only reports what the player did.

export class Input {
  constructor() {
    this.keys = new Set();
    this.dragDX = 0;
    this.dragDY = 0;
    this.pressed = new Set();
    this.mouseHeld = false;
    this.mouseClicked = false;
    this.dragging = false;
    this.lastX = 0;
    this.lastY = 0;
    this.attached = false;
  }

  attach(element) {
    if (this.attached) return;
    this.attached = true;
    const target = element || document.body;

    window.addEventListener('keydown', (event) => {
      if (event.repeat) return;
      this.keys.add(event.code);
      this.pressed.add(event.code);
      if (['Space', 'ArrowUp', 'ArrowDown'].includes(event.code)) {
        event.preventDefault();
      }
    });
    window.addEventListener('keyup', (event) => {
      this.keys.delete(event.code);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseHeld = false;
      this.dragging = false;
    });

    target.addEventListener('mousedown', (event) => {
      if (event.button !== 0) return;
      this.mouseHeld = true;
      this.mouseClicked = true;
      this.dragging = true;
      this.lastX = event.clientX;
      this.lastY = event.clientY;
    });
    window.addEventListener('mousemove', (event) => {
      if (!this.dragging) return;
      this.dragDX += event.clientX - this.lastX;
      this.dragDY += event.clientY - this.lastY;
      this.lastX = event.clientX;
      this.lastY = event.clientY;
    });
    window.addEventListener('mouseup', () => {
      this.mouseHeld = false;
      this.dragging = false;
    });
    target.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  down(code) {
    return this.keys.has(code);
  }

  // True once, on the frame the key went down.
  wasPressed(code) {
    return this.pressed.has(code);
  }

  // Forward/back and strafe as -1..1, from WASD or the arrow keys.
  moveAxis() {
    const fwd =
      (this.down('KeyW') || this.down('ArrowUp') ? 1 : 0) -
      (this.down('KeyS') || this.down('ArrowDown') ? 1 : 0);
    const strafe =
      (this.down('KeyD') || this.down('ArrowRight') ? 1 : 0) -
      (this.down('KeyA') || this.down('ArrowLeft') ? 1 : 0);
    return { fwd, strafe };
  }

  consumeDrag() {
    const out = { dx: this.dragDX, dy: this.dragDY };
    this.dragDX = 0;
    this.dragDY = 0;
    return out;
  }

  consumeClick() {
    const was = this.mouseClicked;
    this.mouseClicked = false;
    return was;
  }

  // Called at the end of every frame so one press is never read twice.
  endFrame() {
    this.pressed.clear();
    this.mouseClicked = false;
  }
}
