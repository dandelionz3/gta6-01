import { HELP, distance } from './config.js';
export function createHUD(game) {
  const byId = id => document.getElementById(id);
  const map = byId('map'), ctx = map.getContext('2d');
  const overlay = byId('overlay');
  let message = '', messageUntil = 0;
  function toast(text, seconds = 4) { message = text; messageUntil = game.time + seconds; }
  function drawMap() {
    const size = 440, scale = 0.79, cx = size / 2, cz = size / 2;
    const px = game.player.x, pz = game.player.z;
    const X = x => cx + (x - px) * scale, Z = z => cz + (z - pz) * scale;
    ctx.fillStyle = '#29464c'; ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#bdb28b'; ctx.fillRect(0, Z(218), size, 80 * scale);
    ctx.fillStyle = '#387d88'; ctx.fillRect(0, Z(286), size, size);
    ctx.lineWidth = 18 * scale; ctx.strokeStyle = '#788589';
    for (const road of game.world.roads) {
      ctx.beginPath(); ctx.moveTo(X(road), Z(-218)); ctx.lineTo(X(road), Z(208)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(X(-218), Z(road)); ctx.lineTo(X(218), Z(road)); ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(X(-265), Z(208)); ctx.lineTo(X(265), Z(208)); ctx.stroke();
    ctx.fillStyle = '#47616a';
    for (const s of game.world.solids) ctx.fillRect(X(s.x - s.w), Z(s.z - s.d), s.w * 2 * scale, s.d * 2 * scale);
    function dot(x, z, radius, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(X(x), Z(z), radius, 0, Math.PI * 2); ctx.fill(); }
    for (const c of game.vehicles.cars) if (c.role !== 'player') dot(c.x, c.z, c.role === 'police' ? 4 : 2.3, c.role === 'police' ? Math.floor(game.time * 5) % 2 ? '#ff736b' : '#6cb9ff' : '#d3dec8');
    for (const c of game.police.cops) if (c.health > 0) dot(c.x, c.z, 3, '#75b3ff');
    for (const e of game.combat.enemies) if (e.health > 0) dot(e.x, e.z, 4, '#ff7469');
    for (const p of game.combat.pickups) if (!p.cooldown) dot(p.x, p.z, 3, p.kind === 'health' ? '#92ffcb' : '#f6da83');
    const target = game.missions.target;
    if (target) {
      ctx.strokeStyle = '#bcffba'; ctx.setLineDash([5, 6]); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx, cz); ctx.lineTo(X(target.x), Z(target.z)); ctx.stroke(); ctx.setLineDash([]);
      const bx = Math.max(13, Math.min(size - 13, X(target.x))), bz = Math.max(13, Math.min(size - 25, Z(target.z)));
      ctx.save(); ctx.translate(bx, bz); ctx.rotate(Math.PI / 4); ctx.fillStyle = '#a6ffd2'; ctx.fillRect(-6, -6, 12, 12); ctx.restore();
    }
    ctx.save(); ctx.translate(cx, cz); ctx.rotate(-game.player.angle);
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#19333b'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, 10); ctx.lineTo(-7, -7); ctx.lineTo(0, -3); ctx.lineTo(7, -7); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    ctx.fillStyle = '#f5e6bf'; ctx.font = 'bold 16px Arial'; ctx.fillText('N', size - 28, 25);
  }
  function update() {
    byId('hud').classList.toggle('hidden', game.mode === 'title' && !game.shot);
    byId('cash').textContent = '$' + Math.floor(game.cash).toLocaleString('en-US');
    const wanted = Math.ceil(game.wanted);
    byId('stars').textContent = '★'.repeat(wanted) + '☆'.repeat(5 - wanted);
    byId('stars').style.opacity = wanted && !game.policeSeen && Math.floor(game.time * 3) % 2 ? 0.45 : 1;
    byId('health-fill').style.width = `${Math.max(0, game.health)}%`;
    byId('health-fill').style.background = game.health < 30 ? '#ff7569' : '#89edb1';
    byId('ammo').textContent = game.car ? `VEHICLE ${Math.max(0, Math.round(game.car.health))}%` : `PISTOL · ${game.ammo} ROUNDS`;
    byId('objective').innerHTML = '<small>STREET OPERATIONS</small>' + game.missions.objective;
    byId('hint').textContent = HELP;
    byId('speed').innerHTML = game.car ? `${Math.round(Math.abs(game.car.speed) * 3.6)}<small>KM/H · ${game.car.type.toUpperCase()}</small>` : '';
    byId('crosshair').style.display = game.car ? 'none' : 'block';
    byId('vignette').style.opacity = Math.max(game.damageFlash * 0.7, game.health < 25 ? 0.12 : 0);
    byId('escape').textContent = game.arrestProgress > 0 ? `ARRESTING ${Math.round(game.arrestProgress * 100)}% · RUN!` : wanted ? game.policeSeen ? 'POLICE HAVE VISUAL' : `SEARCHING · HIDE ${Math.round(game.escapeProgress * 100)}%` : '';
    byId('toast').textContent = message; byId('toast').style.opacity = game.time < messageUntil ? 1 : 0;
    let prompt = '';
    if (!game.car) {
      const c = game.vehicles.cars.find(c => distance(c, game.player) < 4 && c.health > 0);
      if (c) prompt = `E · Enter ${c.type === 'police' ? 'cruiser' : c.type}`;
    } else if (game.car.health <= 0) prompt = 'Vehicle wrecked · E to escape';
    byId('prompt').textContent = prompt; byId('prompt').style.display = prompt ? 'block' : 'none';
    const target = game.missions.target;
    if (target) {
      const d = distance(game.player, target);
      const angle = Math.atan2(target.x - game.player.x, target.z - game.player.z) - game.cameraAngle;
      byId('waypoint').innerHTML = `<div style="transform:rotate(${-angle}rad)">▲</div><span>${Math.round(d)} M</span>`;
    } else byId('waypoint').innerHTML = '';
    byId('district').textContent = game.player.z > 185 ? 'SUNSET STRAND · 17:42' : game.player.z < -140 ? 'NORTH DOCKS · 17:42' : Math.abs(game.player.x) < 95 ? 'DOWNTOWN · 17:42' : 'PALMA DISTRICT · 17:42';
    drawMap();
  }
  function button(text, action, secondary = false) {
    const b = document.createElement('button'); b.textContent = text; if (secondary) b.className = 'secondary'; b.onclick = action; return b;
  }
  function screen(kind) {
    overlay.replaceChildren(); overlay.classList.toggle('hidden', kind === 'play');
    if (kind === 'play') return;
    const panel = document.createElement('section'); panel.className = 'panel'; overlay.append(panel);
    const eyebrow = document.createElement('div'); eyebrow.className = 'eyebrow'; eyebrow.textContent = 'A ROOK STORY · OFFLINE OPEN WORLD'; panel.append(eyebrow);
    if (kind === 'title') {
      panel.insertAdjacentHTML('beforeend', '<h1>SOLMAR<br><em>BAY</em></h1><p>The coast remembers your name. Rook returns to a city of warm nights, borrowed cars and unfinished business. Five jobs. One way out.</p>');
      const actions = document.createElement('div'); actions.className = 'actions'; panel.append(actions);
      actions.append(button('ENTER SOLMAR', () => game.begin(false)));
      if (game.hasSave) actions.append(button('CONTINUE', () => game.begin(true), true));
      panel.insertAdjacentHTML('beforeend', '<div class="controls"><div><b>W A S D</b> Move / drive<br><b>SHIFT</b> Sprint · <b>SPACE</b> Jump / handbrake<br><b>E</b> Enter / exit nearest vehicle</div><div><b>CLICK</b> Pistol · <b>F</b> Punch<br><b>DRAG MOUSE</b> Orbit camera<br><b>M</b> Jobs · <b>ESC</b> Pause · <b>P</b> Mute</div></div><p class="fineprint">ORIGINAL CITY · PROCEDURAL SOUND · LOCAL SAVES</p>');
    } else if (kind === 'missions') {
      panel.insertAdjacentHTML('beforeend', '<h2>Street operations</h2><p>Mara’s ledger. Completed jobs can be replayed. Restarting replaces the active job.</p>');
      game.missions.menu().forEach((m, i) => {
        const b = button(`${i + 1}. ${m.name}  ·  $${m.reward}${m.current ? ' · RESTART' : ''}`, () => { game.mode = 'play'; game.missions.start(i); screen('play'); });
        b.className = 'job'; b.disabled = !m.unlocked; panel.append(b);
      });
      const actions = document.createElement('div'); actions.className = 'actions'; actions.append(button('BACK TO CITY', () => game.resume(), true)); panel.append(actions);
    } else if (kind === 'pause') {
      panel.insertAdjacentHTML('beforeend', '<h2>City on hold</h2><p>Your position, cash, wanted level and completed jobs are saved locally. An interrupted job restarts from its briefing.</p>');
      const actions = document.createElement('div'); actions.className = 'actions'; panel.append(actions);
      actions.append(button('RESUME', () => game.resume()), button('SAVE GAME', () => { game.save(); toast('Saved on this browser'); game.resume(); }, true), button('MISSION LEDGER', () => { game.mode = 'missions'; screen('missions'); }, true));
      panel.insertAdjacentHTML('beforeend', `<p>${HELP}</p>`);
    } else {
      panel.insertAdjacentHTML('beforeend', `<h2>${kind === 'busted' ? 'BUSTED' : 'WASTED'}</h2><p>${kind === 'busted' ? 'Vale’s patrol caught up. Mara paid your bail.' : 'The Bay Clinic patched you up.'} You lost $150. The street is waiting.</p>`);
      const actions = document.createElement('div'); actions.className = 'actions'; actions.append(button('RETURN TO SOLMAR', () => game.respawn())); panel.append(actions);
    }
  }
  return { update, toast, screen };
}
