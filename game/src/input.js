// Keyboard + mouse state for Solmar Bay. Pointer drag orbits the camera,
// a short click (not a drag) fires the pistol. Keys are read per-frame and
// "just pressed" edges are consumed by the game loop.
export class Input {
  constructor(el) {
    this.el = el;
    this.keys = new Set();
    this.pressed = new Set(); // edges since last endFrame()
    this.dragX = 0;
    this.dragY = 0;
    this.clicked = false;
    this.dragging = false;
    this.downX = 0;
    this.downY = 0;
    this.moved = 0;

    this.onKeyDown = (e) => {
      if (e.repeat) return;
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      // keep the page from scrolling / jumping while playing
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
    };
    this.onKeyUp = (e) => this.keys.delete(e.code);
    this.onBlur = () => {
      this.keys.clear();
      this.dragging = false;
    };
    this.onPointerDown = (e) => {
      this.dragging = true;
      this.moved = 0;
      this.downX = e.clientX;
      this.downY = e.clientY;
    };
    this.onPointerMove = (e) => {
      if (!this.dragging) return;
      this.dragX += e.movementX || 0;
      this.dragY += e.movementY || 0;
      this.moved += Math.abs(e.movementX || 0) + Math.abs(e.movementY || 0);
    };
    this.onPointerUp = (e) => {
      if (this.dragging && this.moved < 6) this.clicked = true;
      this.dragging = false;
    };

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    el.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
  }

  down(code) {
    return this.keys.has(code);
  }
  // true once for the frame the key went down
  justPressed(code) {
    return this.pressed.has(code);
  }
  consumeClick() {
    const c = this.clicked;
    this.clicked = false;
    return c;
  }
  consumeDrag() {
    const d = { x: this.dragX, y: this.dragY };
    this.dragX = 0;
    this.dragY = 0;
    return d;
  }
  // WASD / arrows as a -1..1 pair
  moveAxes() {
    let x = 0;
    let z = 0;
    if (this.down('KeyW') || this.down('ArrowUp')) z -= 1;
    if (this.down('KeyS') || this.down('ArrowDown')) z += 1;
    if (this.down('KeyA') || this.down('ArrowLeft')) x -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) x += 1;
    return { x, z };
  }
  endFrame() {
    this.pressed.clear();
  }
  dispose() {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.el.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
  }
}
