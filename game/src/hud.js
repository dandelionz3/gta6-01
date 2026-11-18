// HUD: health bar, cash, wanted stars, speed, objective banner, toasts,
// controls hint, crosshair, damage vignette, and a 2D canvas minimap.

import { WORLD } from "./config.js";

function el(id) {
  return document.getElementById(id);
}

export class Hud {
  constructor() {
    this.minimap = el("minimap");
    this.ctx = this.minimap.getContext("2d");
    this.bannerTimer = 0;
    this.toasts = [];
    this.vignette = el("damage-vignette");
    this._bindMenu();
  }

  _bindMenu() {
    const menu = el("mission-menu");
    const close = el("mission-close");
    if (close) close.addEventListener("click", () => menu.classList.add("hidden"));
  }

  show(id) {
    el(id)?.classList.remove("hidden");
  }

  hide(id) {
    el(id)?.classList.add("hidden");
  }

  setScreen(name) {
    // name: title | play | pause | busted | wasted
    for (const s of ["title-screen", "pause-screen", "busted-screen", "wasted-screen"]) {
      this.hide(s);
    }
    if (name === "title") this.show("title-screen");
    if (name === "pause") this.show("pause-screen");
    if (name === "busted") this.show("busted-screen");
    if (name === "wasted") this.show("wasted-screen");
    const hud = el("hud");
    if (hud) hud.classList.toggle("hidden", name === "title");
  }

  setHealth(hp) {
    const bar = el("health-fill");
    if (bar) bar.style.width = `${Math.max(0, Math.min(100, hp))}%`;
    const label = el("health-num");
    if (label) label.textContent = `${Math.ceil(hp)}`;
  }

  setCash(cash) {
    const c = el("cash");
    if (c) c.textContent = `$${Math.floor(cash).toLocaleString("en-US")}`;
  }

  setWanted(stars) {
    const w = el("wanted");
    if (!w) return;
    w.textContent = "★".repeat(stars) + "☆".repeat(5 - stars);
    w.classList.toggle("hot", stars > 0);
  }

  setSpeed(kmh, inCar) {
    const s = el("speed");
    if (!s) return;
    s.textContent = inCar ? `${Math.round(Math.abs(kmh))} km/h` : "";
  }

  setAmmo(mag, reserve, armed) {
    const a = el("ammo");
    if (!a) return;
    a.textContent = armed ? `${mag} / ${reserve}` : "";
    const ch = el("crosshair");
    if (ch) ch.classList.toggle("hidden", !armed);
  }

  setObjective(text) {
    const o = el("objective");
    if (o) o.textContent = text;
  }

  banner(text, seconds = 4) {
    const b = el("banner");
    if (!b) return;
    b.textContent = text;
    b.classList.remove("hidden");
    this.bannerTimer = seconds;
  }

  toast(text, seconds = 4) {
    const box = el("toasts");
    if (!box) return;
    const div = document.createElement("div");
    div.className = "toast";
    div.textContent = text;
    box.appendChild(div);
    this.toasts.push({ div, t: seconds });
    while (box.children.length > 4) box.removeChild(box.firstChild);
  }

  setVignette(amount) {
    if (this.vignette) this.vignette.style.opacity = String(Math.max(0, Math.min(0.85, amount)));
  }

  showMissionMenu(missions) {
    const menu = el("mission-menu");
    const list = el("mission-list");
    if (!menu || !list) return;
    list.innerHTML = "";
    missions.forEach((m, i) => {
      const row = document.createElement("div");
      row.className = "mission-row" + (i + 1 === missions.current ? " current" : "");
      row.textContent = `${i + 1}. ${m.name} — ${m.brief} ($${m.reward})`;
      list.appendChild(row);
    });
    menu.classList.remove("hidden");
  }

  update(dt) {
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.hide("banner");
    }
    for (let i = this.toasts.length - 1; i >= 0; i--) {
      const t = this.toasts[i];
      t.t -= dt;
      if (t.t <= 0) {
        t.div.remove();
        this.toasts.splice(i, 1);
      }
    }
  }

  // North-up minimap: roads, sea, player arrow, traffic dots, police flashes, mission blip.
  drawMinimap(state) {
    const ctx = this.ctx;
    if (!ctx) return;
    const S = this.minimap.width;
    const half = WORLD.cityHalf + 30;
    const toMap = (x, z) => [((x + half) / (half * 2)) * S, ((z + half) / (half * 2)) * S];
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = "#20242a";
    ctx.fillRect(0, 0, S, S);
    // Sea strip at the bottom (south).
    const [, seaY] = toMap(0, WORLD.beachZ);
    ctx.fillStyle = "#1d6f8e";
    ctx.fillRect(0, seaY, S, S - seaY);
    // Roads.
    ctx.strokeStyle = "#5a5a62";
    ctx.lineWidth = 3;
    for (let i = -4; i <= 4; i++) {
      const c = i * 56;
      const [x] = toMap(c, 0);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, S);
      ctx.stroke();
      const [, z] = toMap(0, c);
      ctx.beginPath();
      ctx.moveTo(0, z);
      ctx.lineTo(S, z);
      ctx.stroke();
    }
    // Mission blip.
    if (state.target) {
      const [bx, by] = toMap(state.target.x, state.target.z);
      const pulse = 5 + Math.sin(performance.now() * 0.006) * 2;
      ctx.fillStyle = "#ffd233";
      ctx.beginPath();
      ctx.arc(bx, by, pulse, 0, Math.PI * 2);
      ctx.fill();
    }
    // Traffic dots.
    ctx.fillStyle = "#bbbbbb";
    for (const p of state.traffic || []) {
      const [tx, ty] = toMap(p.x, p.z);
      ctx.fillRect(tx - 1.5, ty - 1.5, 3, 3);
    }
    // Police: flashing blue/red.
    const flash = Math.sin(performance.now() * 0.012) > 0 ? "#3a6cff" : "#ff3333";
    ctx.fillStyle = flash;
    for (const p of state.police || []) {
      const [px, py] = toMap(p.x, p.z);
      ctx.beginPath();
      ctx.arc(px, py, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Player arrow (rotates with heading).
    const [px, py] = toMap(state.player.x, state.player.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-state.playerHeading);
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 6);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
