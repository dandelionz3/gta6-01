// HUD: health bar, cash, wanted stars, speed, objective banner, toasts,
// crosshair, damage vignette and a 2D north-up minimap on a canvas.
export class HUD {
  constructor() {
    this.el = (id) => document.getElementById(id);
    this.healthFill = this.el("health-fill");
    this.cashEl = this.el("cash");
    this.starsEl = this.el("stars");
    this.speedEl = this.el("speed");
    this.ammoEl = this.el("ammo");
    this.objectiveEl = this.el("objective");
    this.bannerEl = this.el("banner");
    this.toastEl = this.el("toast");
    this.crosshairEl = this.el("crosshair");
    this.vignetteEl = this.el("vignette");
    this.hintEl = this.el("hint");
    this.minimap = this.el("minimap");
    this.mm = this.minimap.getContext("2d");
    this._bannerTimer = 0;
    this._toastTimer = 0;
  }

  setHealth(h) {
    this.healthFill.style.width = Math.max(0, Math.min(100, h)) + "%";
    this.healthFill.style.background = h > 50 ? "#3ddc5a" : h > 25 ? "#e8a020" : "#e83a2a";
  }
  setCash(c) { this.cashEl.textContent = "$" + Math.floor(c).toLocaleString("en-US"); }
  setWanted(n) {
    this.starsEl.textContent = "★".repeat(n) + "☆".repeat(5 - n);
    this.starsEl.style.color = n >= 3 ? "#ff5040" : n >= 1 ? "#ffc020" : "#888888";
  }
  setSpeed(kmh, inCar) {
    this.speedEl.textContent = inCar ? Math.round(kmh) + " km/h" : "";
  }
  setAmmo(mag, reserve, armed) {
    this.ammoEl.textContent = armed ? `Pistol ${mag} / ${reserve}` : "Fists — click to buy a pistol? No: F to punch";
    this.crosshairEl.style.display = armed ? "block" : "none";
  }
  setObjective(text) { this.objectiveEl.textContent = text || ""; }
  setHint(text) { this.hintEl.textContent = text; }

  banner(text, sub = "") {
    this.bannerEl.innerHTML = `<div class="banner-title">${text}</div>` + (sub ? `<div class="banner-sub">${sub}</div>` : "");
    this.bannerEl.style.opacity = "1";
    this._bannerTimer = 3.2;
  }
  toast(text) {
    this.toastEl.textContent = text;
    this.toastEl.style.opacity = "1";
    this._toastTimer = 2.6;
  }
  flashDamage() {
    this.vignetteEl.style.opacity = "0.85";
    setTimeout(() => { this.vignetteEl.style.opacity = "0"; }, 180);
  }

  update(dt) {
    if (this._bannerTimer > 0) {
      this._bannerTimer -= dt;
      if (this._bannerTimer <= 0) this.bannerEl.style.opacity = "0";
    }
    if (this._toastTimer > 0) {
      this._toastTimer -= dt;
      if (this._toastTimer <= 0) this.toastEl.style.opacity = "0";
    }
  }

  // North-up minimap. data: { player {x,z,heading}, trafficCars, cruisers,
  // cops, mission {x,z,visible}, roads, half, flash }
  drawMinimap(data) {
    const ctx = this.mm;
    const S = 180, half = data.half + 60;
    const toMap = (x, z) => [S / 2 + (x / half) * (S / 2 - 6), S / 2 + (z / half) * (S / 2 - 6)];
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = "rgba(20, 28, 34, 0.82)";
    ctx.fillRect(0, 0, S, S);
    // roads
    ctx.strokeStyle = "#5a6068";
    ctx.lineWidth = 3;
    for (const r of data.roads) {
      const [x1, y1] = toMap(r.axis === "x" ? -r.len / 2 : r.x, r.axis === "x" ? r.z : -r.len / 2);
      const [x2, y2] = toMap(r.axis === "x" ? r.len / 2 : r.x, r.axis === "x" ? r.z : r.len / 2);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
    // beach strip
    ctx.fillStyle = "#c8a860";
    const [bx, by] = toMap(-half, 200);
    ctx.fillRect(4, by, S - 8, S - by - 4);
    // mission blip
    if (data.mission && data.mission.visible) {
      const [mx, my] = toMap(data.mission.x, data.mission.z);
      const pulse = 5 + Math.sin(data.time * 5) * 2;
      ctx.fillStyle = "#ffc020";
      ctx.beginPath(); ctx.arc(mx, my, pulse, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(mx, my, pulse + 2.5, 0, Math.PI * 2); ctx.stroke();
    }
    // traffic dots
    ctx.fillStyle = "#9fb4c8";
    for (const c of data.trafficCars) {
      const [cx, cy] = toMap(c.x, c.z);
      ctx.fillRect(cx - 1.5, cy - 1.5, 3, 3);
    }
    // police — flashing blue/red
    const flashBlue = Math.floor(data.time * 3) % 2 === 0;
    ctx.fillStyle = flashBlue ? "#3a6aff" : "#ff3a3a";
    for (const c of data.cruisers) {
      const [cx, cy] = toMap(c.pos.x, c.pos.z);
      ctx.beginPath(); ctx.arc(cx, cy, 3.5, 0, Math.PI * 2); ctx.fill();
    }
    for (const c of data.cops) {
      const [cx, cy] = toMap(c.x, c.z);
      ctx.beginPath(); ctx.arc(cx, cy, 2.5, 0, Math.PI * 2); ctx.fill();
    }
    // player arrow
    const [px, py] = toMap(data.player.x, data.player.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(data.player.heading);
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.moveTo(0, -7); ctx.lineTo(5, 5); ctx.lineTo(0, 2.5); ctx.lineTo(-5, 5);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#111"; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();
  }

  showScreen(name) {
    for (const id of ["screen-title", "screen-pause", "screen-busted", "screen-wasted", "screen-missions"]) {
      const el = document.getElementById(id);
      if (el) el.style.display = id === "screen-" + name ? "flex" : "none";
    }
    const hud = document.getElementById("hud");
    if (hud) hud.style.display = name === "play" ? "block" : "none";
  }
}
