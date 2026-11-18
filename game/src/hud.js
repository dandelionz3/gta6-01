// HUD for Solmar Bay: health, cash, wanted stars, speed, objective line,
// banner + toasts, crosshair, damage vignette, and a 2D canvas minimap.
// The DOM lives in index.html; this module only drives it.
export class Hud {
  constructor(doc) {
    this.doc = doc;
    const $ = (id) => doc.getElementById(id);
    this.el = {
      hud: $('hud'),
      healthFill: $('health-fill'),
      healthText: $('health-text'),
      cash: $('cash'),
      stars: $('stars'),
      speed: $('speed'),
      speedBox: $('speed-box'),
      ammo: $('ammo'),
      ammoBox: $('ammo-box'),
      banner: $('banner'),
      bannerTitle: $('banner-title'),
      bannerSub: $('banner-sub'),
      toast: $('toast'),
      objective: $('objective'),
      hint: $('hint'),
      crosshair: $('crosshair'),
      vignette: $('vignette'),
      minimap: $('minimap'),
      title: $('screen-title'),
      pause: $('screen-pause'),
      busted: $('screen-busted'),
      wasted: $('screen-wasted'),
      mission: $('screen-mission'),
      missionList: $('mission-list'),
      mute: $('mute-icon'),
    };
    this.mapCtx = this.el.minimap ? this.el.minimap.getContext('2d') : null;
    this.time = 0;
    this._bannerTimer = 0;
    this._toastTimer = 0;
  }

  // s: {health, maxHealth, cash, stars, speedKmh, inCar, armed, ammo,
  //     objective, muted, map:{roads, player, cars, peds, police, blip,
  //     bounds, beachStart}}
  update(dt, s) {
    this.time += dt;
    const e = this.el;
    if (e.healthFill) e.healthFill.style.width = `${Math.max(0, (s.health / s.maxHealth) * 100)}%`;
    if (e.healthText) e.healthText.textContent = `${Math.ceil(Math.max(0, s.health))}`;
    if (e.cash) e.cash.textContent = `$${Math.floor(s.cash).toLocaleString('en-US')}`;
    if (e.stars) {
      let stars = '';
      for (let i = 0; i < 5; i++) stars += i < s.stars ? '★' : '☆';
      e.stars.textContent = stars;
      e.stars.classList.toggle('hot', s.stars >= 3);
    }
    if (e.speedBox) e.speedBox.style.display = s.inCar ? 'block' : 'none';
    if (e.speed) e.speed.textContent = `${Math.round(s.speedKmh)}`;
    if (e.ammoBox) e.ammoBox.style.display = s.armed ? 'block' : 'none';
    if (e.ammo) e.ammo.textContent = `${s.ammo}`;
    if (e.crosshair) e.crosshair.style.display = s.armed && !s.inCar ? 'block' : 'none';
    if (e.mute) e.mute.style.display = s.muted ? 'block' : 'none';
    if (s.objective && e.objective) e.objective.textContent = s.objective;
    if (this.mapCtx && s.map) this.drawMinimap(s.map);
  }

  setObjective(text) {
    if (this.el.objective) this.el.objective.textContent = text;
  }

  banner(title, sub, ms = 3600) {
    const e = this.el;
    if (!e.banner) return;
    e.bannerTitle.textContent = title;
    e.bannerSub.textContent = sub || '';
    e.banner.classList.add('show');
    clearTimeout(this._bannerTimer);
    this._bannerTimer = setTimeout(() => e.banner.classList.remove('show'), ms);
  }

  toast(msg, ms = 2800) {
    const e = this.el;
    if (!e.toast) return;
    e.toast.textContent = msg;
    e.toast.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => e.toast.classList.remove('show'), ms);
  }

  flashDamage() {
    const v = this.el.vignette;
    if (!v) return;
    v.style.opacity = '0.75';
    setTimeout(() => {
      v.style.opacity = '0';
    }, 160);
  }

  // name: 'title' | 'pause' | 'busted' | 'wasted' | 'mission' | null
  showScreen(name) {
    const e = this.el;
    const map = { title: e.title, pause: e.pause, busted: e.busted, wasted: e.wasted, mission: e.mission };
    for (const [key, el] of Object.entries(map)) {
      if (el) el.style.display = key === name ? 'flex' : 'none';
    }
    if (e.hud) e.hud.style.display = name === null || name === 'mission' || name === 'pause' ? 'block' : 'none';
  }

  // Mission menu: rebuild the list; onSelect(i) fires when the player
  // clicks a mission row.
  buildMissionMenu(missions, currentIndex, allDone, onSelect) {
    const list = this.el.missionList;
    if (!list) return;
    list.innerHTML = '';
    missions.forEach((m, i) => {
      const row = this.doc.createElement('div');
      row.className = 'mission-row' + (i === currentIndex ? ' current' : '') + (i < currentIndex ? ' done' : '');
      row.innerHTML = `<span class="m-num">${m.id}</span><span class="m-name">${m.name}</span><span class="m-reward">$${m.reward}</span><span class="m-state">${i < currentIndex ? 'DONE' : i === currentIndex ? 'CURRENT' : ''}</span>`;
      row.addEventListener('click', () => onSelect(i));
      list.appendChild(row);
    });
    if (allDone) {
      const done = this.doc.createElement('div');
      done.className = 'mission-done';
      done.textContent = 'Story complete — free roam Solmar Bay.';
      list.appendChild(done);
    }
  }

  // North-up minimap: roads, sand + sea at the bottom, player arrow,
  // traffic dots, flashing police, pulsing mission blip.
  drawMinimap(m) {
    const ctx = this.mapCtx;
    const size = 180;
    const half = m.bounds + 20;
    const toMap = (x, z) => [((x + half) / (half * 2)) * size, ((z + half) / (half * 2)) * size];
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#20261f';
    ctx.fillRect(0, 0, size, size);
    // Sea + sand along the south edge.
    const [, beachY] = toMap(0, m.beachStart);
    ctx.fillStyle = '#d9b380';
    ctx.fillRect(0, beachY, size, size - beachY);
    ctx.fillStyle = '#1f6f8f';
    const [, seaY] = toMap(0, 252);
    ctx.fillRect(0, seaY, size, size - seaY);
    // Roads.
    ctx.strokeStyle = '#5a5f66';
    ctx.lineWidth = 2;
    for (const r of m.roads) {
      const [x0, y0] = toMap(r.x0, r.z0);
      const [x1, y1] = toMap(r.x1, r.z1);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }
    // Pedestrians: faint grey dots.
    ctx.fillStyle = '#9aa0a8';
    for (const [x, z] of m.peds) {
      const [mx, my] = toMap(x, z);
      ctx.fillRect(mx - 1, my - 1, 2, 2);
    }
    // Traffic: white dots.
    ctx.fillStyle = '#ffffff';
    for (const [x, z] of m.cars) {
      const [mx, my] = toMap(x, z);
      ctx.fillRect(mx - 1.5, my - 1.5, 3, 3);
    }
    // Mission blip: pulsing gold ring.
    if (m.blip) {
      const [bx, by] = toMap(m.blip.x, m.blip.z);
      const pulse = 4 + Math.sin(this.time * 4) * 1.5;
      ctx.strokeStyle = '#ffd24a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(bx, by, pulse + 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#ffd24a';
      ctx.beginPath();
      ctx.arc(bx, by, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // Police: flashing blue/red.
    const blink = Math.floor(this.time * 3) % 2 === 0;
    ctx.fillStyle = blink ? '#3a6aff' : '#ff3a3a';
    for (const [x, z] of m.police) {
      const [mx, my] = toMap(x, z);
      ctx.beginPath();
      ctx.arc(mx, my, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Player arrow, rotated by heading.
    const [px, py] = toMap(m.player.x, m.player.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(m.player.heading);
    ctx.fillStyle = '#ff5a3c';
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 6);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
    // Frame.
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, size - 1, size - 1);
  }
}
