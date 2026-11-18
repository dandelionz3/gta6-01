// Keyboard + mouse state. Drag orbits the camera, click shoots (when armed).

import { KEYS } from "./config.js";

export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.mouseDown = false;
    this.mouseClicked = false; // consumed by combat each frame
    this.dragDX = 0;
    this.dragDY = 0;
    this._dragging = false;
    this._lastX = 0;
    this._lastY = 0;
    this._pressed = new Set(); // edge-triggered keys, consumed per frame
    this.canvas = canvas;
    this._onKeyDown = (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this._pressed.add(e.code);
      if (e.code === KEYS.jump) e.preventDefault();
    };
    this._onKeyUp = (e) => this.keys.delete(e.code);
    this._onMouseDown = (e) => {
      this.mouseDown = true;
      this.mouseClicked = true;
      this._dragging = true;
      this._lastX = e.clientX;
      this._lastY = e.clientY;
    };
    this._onMouseUp = () => {
      this.mouseDown = false;
      this._dragging = false;
    };
    this._onMouseMove = (e) => {
      if (!this._dragging) return;
      this.dragDX += e.clientX - this._lastX;
      this.dragDY += e.clientY - this._lastY;
      this._lastX = e.clientX;
      this._lastY = e.clientY;
    };
    this._onBlur = () => {
      this.keys.clear();
      this.mouseDown = false;
      this._dragging = false;
    };
    window.addEventListener("keydown", this._onKeyDown);
    window.addEventListener("keyup", this._onKeyUp);
    canvas.addEventListener("mousedown", this._onMouseDown);
    window.addEventListener("mouseup", this._onMouseUp);
    window.addEventListener("mousemove", this._onMouseMove);
    window.addEventListener("blur", this._onBlur);
  }

  down(code) {
    return this.keys.has(code);
  }

  // True once, on the frame the key went down.
  pressed(code) {
    return this._pressed.has(code);
  }

  axis() {
    let x = 0;
    let z = 0;
    if (this.down(KEYS.forward)) z -= 1;
    if (this.down(KEYS.back)) z += 1;
    if (this.down(KEYS.left)) x -= 1;
    if (this.down(KEYS.right)) x += 1;
    return { x, z };
  }

  takeDrag() {
    const d = { dx: this.dragDX, dy: this.dragDY };
    this.dragDX = 0;
    this.dragDY = 0;
    return d;
  }

  takeClick() {
    const c = this.mouseClicked;
    this.mouseClicked = false;
    return c;
  }

  endFrame() {
    this._pressed.clear();
  }

  dispose() {
    window.removeEventListener("keydown", this._onKeyDown);
    window.removeEventListener("keyup", this._onKeyUp);
    this.canvas.removeEventListener("mousedown", this._onMouseDown);
    window.removeEventListener("mouseup", this._onMouseUp);
    window.removeEventListener("mousemove", this._onMouseMove);
    window.removeEventListener("blur", this._onBlur);
  }
}
