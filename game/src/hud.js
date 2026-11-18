// HUD for Solmar Bay: health, cash, wanted stars, speed, objective
// banner, toasts, crosshair, damage vignette and a north-up minimap
// drawn on a 2D canvas. All DOM lookups happen once, up front.

export class Hud {
  constructor() {
    const byId = (id) => document.getElementById(id);
    this.el = {
      healthFill: byId('health-fill'),
      healthText: byId('health-text'),
      cash: byId('cash'),
      stars: byId('stars'),
      speed: byId('speed'),
      speedBox: byId('speed-box'),
      ammo: byId('ammo'),
      objective: byId('objective'),
      toast: byId('toast'),
      crosshair: byId('crosshair'),
      vignette: byId('vignette'),
      minimap: byId('minimap'),
      hint: byId('hint'),
      mute: byId('mute-tag'),
      missionMenu: byId('mission-menu'),
      missionList: byId('mission-list'),
    };
    this.minimapCtx = this.el.minimap ? this.el.minimap.getContext('2d') : null;
    this.toastTimer = null;
    this.damageTimer = null;
  }

  setHealth(value, max) {
    const pct = Math.max(0, Math.min(100, (value / max) * 100));
    if (this.el.healthFill) this.el.healthFill.style.width = `${pct}%`;
    if (this.el.healthText) this.el.healthText.textContent = `${Math.ceil(value)}`;
    if (pct < 30 && this.el.healthFill) this.el.healthFill.style.background = '#d22a2a';
    else if (this.el.healthFill) this.el.healthFill.style.background = '#3aa84a';
  }

  setCash(value) {
    if (this.el.cash) this.el.cash.textContent = `$${Math.floor(value).toLocaleString('en-US')}`;
  }

  setStars(n) {
    if (!this.el.stars) return;
    let out = '';
    for (let i = 0; i < 5; i++) {
      out += i < n ? '★' : '☆';
    }
    this.el.stars.textContent = out;
    this.el.stars.style.color = n > 0 ? '#ffd23e' : '#888888';
  }

  setSpeed(kmh, driving) {
    if (!this.el.speedBox) return;
    this.el.speedBox.style.display = driving ? 'block' : 'none';
    if (this.el.speed) this.el.speed.textContent = `${Math.round(kmh)}`;
  }

  setAmmo(n, armed) {
    if (!this.el.ammo) return;
    this.el.ammo.style.display = armed ? 'block' : 'none';
    this.el.ammo.textContent = `Pistol ${n}`;
  }

  setObjective(text) {
    if (this.el.objective) this.el.objective.textContent = text;
  }

  setCrosshair(visible) {
    if (this.el.crosshair) this.el.crosshair.style.display = visible ? 'block' : 'none';
  }

  setMuted(muted) {
    if (this.el.mute) this.el.mute.style.display = muted ? 'block' : 'none';
  }

  toast(message) {
    if (!this.el.toast) return;
    this.el.toast.textContent = message;
    this.el.toast.style.opacity = '1';
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.el.toast.style.opacity = '0';
    }, 3600);
  }

  damageFlash() {
    if (!this.el.vignette) return;
    this.el.vignette.style.opacity = '0.85';
    if (this.damageTimer) clearTimeout(this.damageTimer);
    this.damageTimer = setTimeout(() => {
      this.el.vignette.style.opacity = '0';
    }, 220);
  }

  showMissionMenu(missions, currentIndex) {
    if (!this.el.missionMenu || !this.el.missionList) return;
    this.el.missionList.innerHTML = missions
      .map(
        (m, i) =>
          `<div class="mission-row${i === currentIndex ? ' current' : ''}${i < currentIndex ? ' done' : ''}">${i + 1}. ${m.name} — $${m.reward}${i < currentIndex ? ' ✓' : ''}</div>`,
      )
      .join('');
    this.el.missionMenu.style.display = 'block';
  }

  hideMissionMenu() {
    if (this.el.missionMenu) this.el.missionMenu.style.display = 'none';
  }

  showScreen(name) {
    // name: 'title' | 'pause' | 'busted' | 'wasted' | null
    for (const id of ['screen-title', 'screen-pause', 'screen-busted', 'screen-wasted']) {
      const el = document.getElementById(id);
      if (el) el.style.display = id === `screen-${name}` ? 'flex' : 'none';
    }
  }

  drawMinimap(world, player, trafficDots, policeDots, missionTarget) {
    const ctx = this.minimapCtx;
    if (!ctx || !this.el.minimap) return;
    const S = this.el.minimap.width; // square canvas
    const half = 210;
    const toMap = (x, z) => [((x + half) / (half * 2)) * S, ((z + half) / (half * 2)) * S];
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = 'rgba(20, 32, 44, 0.88)';
    ctx.fillRect(0, 0, S, S);
    // ocean strip at the bottom (south)
    const [, beachY] = toMap(0, 192);
    ctx.fillStyle = '#1d6f8f';
    ctx.fillRect(0, beachY, S, S - beachY);
    ctx.fillStyle = '#e0c188';
    ctx.fillRect(0, beachY - 4, S, 4);
    // roads
    ctx.strokeStyle = '#5a6068';
    ctx.lineWidth = 3;
    for (const line of world.roadLines) {
      ctx.beginPath();
      if (line.axis === 'z') {
        const [x1, y1] = toMap(line.at, line.from);
        const [x2, y2] = toMap(line.at, line.to);
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
      } else {
        const [x1, y1] = toMap(line.from, line.at);
        const [x2, y2] = toMap(line.to, line.at);
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
      }
      ctx.stroke();
    }
    // mission blip
    if (missionTarget) {
      const [mx, my] = toMap(missionTarget.x, missionTarget.z);
      const pulse = 5 + Math.sin(performance.now() * 0.006) * 1.5;
      ctx.fillStyle = '#ffd23e';
      ctx.beginPath();
      ctx.arc(mx, my, pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    // traffic + pedestrians
    ctx.fillStyle = '#bbbbbb';
    for (const d of trafficDots.cars) {
      const [x, y] = toMap(d.x, d.z);
      ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
    // police flash blue/red
    const flashBlue = Math.floor(performance.now() / 350) % 2 === 0;
    ctx.fillStyle = flashBlue ? '#2a6aff' : '#ff2a2a';
    for (const d of [...policeDots.cops, ...policeDots.cruisers]) {
      const [x, y] = toMap(d.x, d.z);
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // player arrow, rotated by heading
    const [px, py] = toMap(player.x, player.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(player.heading);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}
