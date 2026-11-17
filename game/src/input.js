export function createInput(canvas) {
  const held = new Set(), pressed = new Set();
  const input = { held, pressed, orbit: 0, pitch: 0.36, shoot: false, dragging: false };
  window.addEventListener('keydown', e => {
    if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
    if (!held.has(e.code)) pressed.add(e.code);
    held.add(e.code);
  });
  window.addEventListener('keyup', e => held.delete(e.code));
  window.addEventListener('blur', () => held.clear());
  let startX = 0, startY = 0, moved = 0;
  canvas.addEventListener('pointerdown', e => {
    input.dragging = true; startX = e.clientX; startY = e.clientY; moved = 0;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', e => {
    if (!input.dragging) return;
    const dx = e.clientX - startX, dy = e.clientY - startY;
    moved += Math.abs(dx) + Math.abs(dy);
    input.orbit -= dx * 0.006;
    input.pitch = Math.max(0.12, Math.min(0.9, input.pitch + dy * 0.003));
    startX = e.clientX; startY = e.clientY;
  });
  canvas.addEventListener('pointerup', () => { if (moved < 8) input.shoot = true; input.dragging = false; });
  input.endFrame = () => { pressed.clear(); input.shoot = false; };
  return input;
}
