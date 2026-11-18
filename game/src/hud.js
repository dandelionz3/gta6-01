// DOM HUD: health, cash, wanted stars, speed, ammo, objective banner,
// toasts, minimap canvas, crosshair, damage vignette, screen switching.
export class Hud {
  constructor() {
    this.el = {
      hud: document.getElementById('hud'),
      healthFill: document.getElementById('health-fill'),
      healthText: document.getElementById('health-text'),
      cash: document.getElementById('cash'),
      stars: document.getElementById('stars'),
      speed: document.getElementById('speed'),
      speedValue: document.getElementById('speed-value'),
      ammo: document.getElementById('ammo'),
      ammoValue: document.getElementById('ammo-value'),
      objective: document.getElementById('objective'),
      toast: document.getElementById('toast'),
      minimap: document.getElementById('minimap'),
      crosshair: document.getElementById('crosshair'),
      vignette: document.getElementById('vignette'),
      hint: document.getElementById('hint'),
      missionList: document.getElementById('mission-list'),
      missionTitle: document.getElementById('mission-title'),
    };
    this.mm = this.el.minimap ? this.el.minimap.getContext('2d') : null;
    this.toastTimer = 0;
    this.vignetteTimer = 0;
  }

  setHealth(h) {
    const pct = Math.max(0, Math.min(100, h));
    if (this.el.healthFill) this.el.healthFill.style.width = `${pct}%`;
    if (this.el.healthFill) {
      this.el.healthFill.style.background = pct > 55 ? '#3fce5a' : pct > 25 ? '#e8a13a' : '#d83a2e';
    }
    if (this.el.healthText) this.el.healthText.textContent = `${Math.ceil(pct)}`;
  }

  setCash(n) {
    if (this.el.cash) this.el.cash.textContent = `$${Math.floor(n).toLocaleString('en-US')}`;
  }

  setWanted(n) {
    if (!this.el.stars) return;
    let s = '';
    for (let i = 0; i < 5; i++) s += i < n ? '★' : '☆';
    this.el.stars.textContent = s;
    this.el.stars.classList.toggle('hot', n >= 3);
  }

  setSpeed(kmh) {
    if (!this.el.speed) return;
    if (kmh > 1) {
      this.el.speed.style.display = 'block';
      if (this.el.speedValue) this.el.speedValue.textContent = `${Math.round(kmh)}`;
    } else {
      this.el.speed.style.display = 'none';
    }
  }

  setAmmo(n) {
    if (!this.el.ammo) return;
    if (n > 0) {
      this.el.ammo.style.display = 'block';
      if (this.el.ammoValue) this.el.ammoValue.textContent = `${n}`;
    } else {
      this.el.ammo.style.display = 'none';
    }
  }

  setObjective(text) {
    if (this.el.objective) this.el.objective.textContent = text || '';
  }

  toast(text, ms = 4200) {
    if (!this.el.toast) return;
    this.el.toast.textContent = text;
    this.el.toast.style.opacity = '1';
    this.toastTimer = ms / 1000;
  }

  setCrosshair(on) {
    if (this.el.crosshair) this.el.crosshair.style.display = on ? 'block' : 'none';
  }

  damageFlash() {
    this.vignetteTimer = 0.55;
    if (this.el.vignette) this.el.vignette.style.opacity = '0.85';
  }

  setHintVisible(on) {
    if (this.el.hint) this.el.hint.style.display = on ? 'block' : 'none';
  }

  tick(dt) {
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0 && this.el.toast) this.el.toast.style.opacity = '0';
    }
    if (this.vignetteTimer > 0) {
      this.vignetteTimer -= dt;
      if (this.vignetteTimer <= 0 && this.el.vignette) this.el.vignette.style.opacity = '0';
    }
  }

  showScreen(name) {
    for (const id of ['screen-title', 'screen-pause', 'screen-busted', 'screen-wasted', 'screen-mission']) {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('hidden', id !== name);
    }
    if (this.el.hud) this.el.hud.style.display = name ? 'none' : 'block';
  }

  showHud(on) {
    if (this.el.hud) this.el.hud.style.display = on ? 'block' : 'none';
  }

  renderMissionList(missions, currentIndex, doneCount) {
    if (!this.el.missionList) return;
    this.el.missionList.innerHTML = '';
    missions.forEach((m, i) => {
      const row = document.createElement('div');
      row.className = 'mission-row';
      const state = i < doneCount ? '✓' : i === currentIndex ? '▶' : '·';
      row.innerHTML = `<span class="m-state">${state}</span><span class="m-title">${m.id}. ${m.title}</span><span class="m-reward">$${m.reward}</span>`;
      this.el.missionList.appendChild(row);
    });
    if (this.el.missionTitle) {
      this.el.missionTitle.textContent = doneCount >= missions.length
        ? 'Story complete — free roam'
        : `Next: ${missions[currentIndex].id}. ${missions[currentIndex].title}`;
    }
  }

  // north-up minimap: roads, beach, player arrow, traffic, police, mission blip
  drawMinimap(world, player, traffic, police, missionPos, time) {
    if (!this.mm) return;
    const c = this.mm;
    const S = this.el.minimap.width;
    const half = world.bounds + 50;
    const toPx = (v) => ((v + half) / (half * 2)) * S;
    c.clearRect(0, 0, S, S);
    c.fillStyle = 'rgba(16, 22, 30, 0.82)';
    c.fillRect(0, 0, S, S);
    // sea + sand
    c.fillStyle = '#1e6f8e';
    c.fillRect(0, toPx(world.seaZ), S, S - toPx(world.seaZ));
    c.fillStyle = '#c9ab72';
    c.fillRect(0, toPx(world.beachZ), S, toPx(world.seaZ) - toPx(world.beachZ));
    // roads
    c.strokeStyle = '#5a6068';
    c.lineWidth = 3;
    for (const L of world.lines) {
      c.beginPath(); c.moveTo(toPx(L), toPx(-half)); c.lineTo(toPx(L), toPx(half)); c.stroke();
      c.beginPath(); c.moveTo(toPx(-half), toPx(L)); c.lineTo(toPx(half), toPx(L)); c.stroke();
    }
    // mission blip (pulsing)
    if (missionPos) {
      const pulse = 4 + Math.sin(time * 5) * 1.6;
      c.fillStyle = '#ffd94a';
      c.beginPath(); c.arc(toPx(missionPos.x), toPx(missionPos.z), pulse, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#fff2c0';
      c.lineWidth = 1.5;
      c.beginPath(); c.arc(toPx(missionPos.x), toPx(missionPos.z), pulse + 3, 0, Math.PI * 2); c.stroke();
    }
    // traffic dots
    c.fillStyle = '#c8ccd2';
    for (const car of traffic.cars) {
      c.fillRect(toPx(car.group.position.x) - 1.5, toPx(car.group.position.z) - 1.5, 3, 3);
    }
    // police flashing
    const flashBlue = Math.floor(time * 3) % 2 === 0;
    c.fillStyle = flashBlue ? '#3a86ff' : '#ff3a2e';
    for (const car of police.cruisers) {
      c.beginPath();
      c.arc(toPx(car.group.position.x), toPx(car.group.position.z), 3.5, 0, Math.PI * 2);
      c.fill();
    }
    for (const cop of police.cops) {
      c.beginPath();
      c.arc(toPx(cop.x), toPx(cop.z), 2.5, 0, Math.PI * 2);
      c.fill();
    }
    // player arrow
    const px = toPx(player.pos.x);
    const pz = toPx(player.pos.z);
    c.save();
    c.translate(px, pz);
    c.rotate(player.heading);
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.moveTo(0, -6); c.lineTo(4.5, 5); c.lineTo(0, 2.5); c.lineTo(-4.5, 5);
    c.closePath();
    c.fill();
    c.strokeStyle = '#222';
    c.lineWidth = 1;
    c.stroke();
    c.restore();
  }
}
