"use strict";
/* Kingdom Guard — a compact tower-defense. Vertical, touch-first, self-contained. */

const W = 720, H = 1280;               // logical resolution
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

/* ---------- responsive fit ---------- */
let scale = 1, offX = 0, offY = 0;
function fit() {
  const vw = window.innerWidth, vh = window.innerHeight;
  scale = Math.min(vw / W, vh / H);
  canvas.width = W; canvas.height = H;
  canvas.style.width = (W * scale) + "px";
  canvas.style.height = (H * scale) + "px";
}
window.addEventListener("resize", fit); fit();

/* ---------- assets ---------- */
const IMG = {};
const assetList = {
  enemy_slime:"img/enemy_slime.png", enemy_runner:"img/enemy_runner.png",
  enemy_tank:"img/enemy_tank.png", enemy_boss:"img/enemy_boss.png",
  tower_cannon:"img/tower_cannon.png", tower_archer:"img/tower_archer.png",
  tower_frost:"img/tower_frost.png", crystal:"img/crystal.png",
};
let loaded = 0, total = Object.keys(assetList).length;
for (const k in assetList) {
  const im = new Image();
  im.onload = () => { IMG[k] = im; loaded++; };
  im.onerror = () => { loaded++; };   // tolerate missing → fallback shapes
  im.src = assetList[k];
}

/* ---------- map ---------- */
const PATH = [
  {x:360,y:-60},{x:360,y:190},{x:565,y:190},{x:565,y:430},
  {x:165,y:430},{x:165,y:665},{x:565,y:665},{x:565,y:900},
  {x:360,y:900},{x:360,y:1110}
];
const CRYSTAL = {x:360, y:1120};
const SPOTS = [
  {x:470,y:110},{x:250,y:300},{x:670,y:310},{x:70,y:545},{x:280,y:545},
  {x:665,y:545},{x:455,y:780},{x:250,y:790},{x:665,y:790},{x:250,y:1010},{x:470,y:1010}
];

/* path segment lengths for distance→position */
let SEG = [], PATHLEN = 0;
for (let i=0;i<PATH.length-1;i++){
  const dx=PATH[i+1].x-PATH[i].x, dy=PATH[i+1].y-PATH[i].y;
  const len=Math.hypot(dx,dy); SEG.push({len, a:PATH[i], b:PATH[i+1]}); PATHLEN+=len;
}
function posAt(dist){
  let d=dist;
  for (const s of SEG){ if (d<=s.len){ const t=d/s.len; return {x:s.a.x+(s.b.x-s.a.x)*t, y:s.a.y+(s.b.y-s.a.y)*t}; } d-=s.len; }
  return {x:PATH[PATH.length-1].x, y:PATH[PATH.length-1].y};
}

/* ---------- data ---------- */
const TOWERS = {
  cannon:{ name:"Cannon", cost:45, color:"#3aa0c0", range:165, dmg:24, rate:0.95, splash:46, proj:"#2a2a2a", pspeed:640, desc:"Splash damage" },
  archer:{ name:"Archer", cost:32, color:"#8fe36a", range:200, dmg:11, rate:0.34, splash:0, proj:"#ffe08a", pspeed:820, desc:"Fast single shots" },
  frost:{  name:"Frost",  cost:55, color:"#7ec8ff", range:150, dmg:7,  rate:0.8, splash:0, proj:"#bfeaff", pspeed:700, slow:0.5, slowT:1.6, desc:"Slows enemies" },
};
const ENEMIES = {
  slime:{ hp:62, speed:56, gold:6, r:26, img:"enemy_slime", color:"#7ed957" },
  runner:{ hp:42, speed:118, gold:7, r:22, img:"enemy_runner", color:"#ffd76b" },
  tank:{ hp:300, speed:40, gold:17, r:34, img:"enemy_tank", color:"#c58bff" },
  boss:{ hp:1600, speed:32, gold:130, r:48, img:"enemy_boss", color:"#ff5e6b" },
};
/* waves: list of {t:type, n:count, gap:seconds} groups spawned sequentially */
const WAVES = [
  [{t:"slime",n:8,gap:0.8}],
  [{t:"slime",n:10,gap:0.65},{t:"runner",n:4,gap:0.5}],
  [{t:"runner",n:10,gap:0.42}],
  [{t:"slime",n:12,gap:0.5},{t:"tank",n:2,gap:1.2}],
  [{t:"runner",n:14,gap:0.35},{t:"slime",n:8,gap:0.4}],
  [{t:"tank",n:5,gap:1.0}],
  [{t:"slime",n:16,gap:0.35},{t:"runner",n:10,gap:0.3}],
  [{t:"tank",n:6,gap:0.9},{t:"runner",n:12,gap:0.3}],
  [{t:"runner",n:22,gap:0.25}],
  [{t:"tank",n:8,gap:0.8},{t:"slime",n:16,gap:0.3}],
  [{t:"slime",n:20,gap:0.3},{t:"runner",n:16,gap:0.25},{t:"tank",n:5,gap:0.9}],
  [{t:"boss",n:1,gap:1},{t:"tank",n:10,gap:0.7},{t:"runner",n:20,gap:0.25}],
];

/* ---------- state ---------- */
let G;
function newGame(){
  G = { gold:120, lives:20, wave:0, running:false, over:false, win:false,
        enemies:[], towers:[], shots:[], fx:[], speed:1,
        spawnQ:[], spawnT:0, selSpot:null, selTower:null };
  SPOTS.forEach(s=>{ s.used=false; });
}
newGame();

/* ---------- spawning ---------- */
function startWave(){
  if (G.running || G.over) return;
  if (G.wave >= WAVES.length) return;
  const groups = WAVES[G.wave];
  G.spawnQ = [];
  for (const grp of groups) for (let i=0;i<grp.n;i++) G.spawnQ.push({t:grp.t, delay:grp.gap});
  G.wave++; G.running = true; G.spawnT = 0;
  updateHUD(); setStartBtn();
}
function spawnEnemy(type){
  const e = ENEMIES[type];
  const hpScale = 1 + (G.wave-1)*0.10;
  G.enemies.push({ type, x:PATH[0].x, y:PATH[0].y, dist:0,
    hp:e.hp*hpScale, maxhp:e.hp*hpScale, speed:e.speed, r:e.r, gold:e.gold,
    slowUntil:0, slowMul:1, hit:0 });
}

/* ---------- towers ---------- */
function buildTower(spot, type){
  const def = TOWERS[type];
  if (G.gold < def.cost || spot.used) return false;
  G.gold -= def.cost; spot.used = true;
  G.towers.push({ x:spot.x, y:spot.y, type, lvl:1, cd:0, angle:-Math.PI/2, spot, spent:def.cost });
  updateHUD(); return true;
}
function towerStat(t){
  const d = TOWERS[t.type], m = 1 + (t.lvl-1)*0.45;
  return { range:d.range*(1+(t.lvl-1)*0.10), dmg:d.dmg*m, rate:d.rate, splash:d.splash, pspeed:d.pspeed,
           proj:d.proj, slow:d.slow, slowT:d.slowT };
}
function upgradeCost(t){ return Math.round(TOWERS[t.type].cost * (0.8 + t.lvl*0.55)); }

/* ---------- combat ---------- */
function update(dt){
  if (!G.running) return;
  // spawn
  if (G.spawnQ.length){
    G.spawnT -= dt;
    if (G.spawnT <= 0){ const s=G.spawnQ.shift(); spawnEnemy(s.t); G.spawnT = s.delay; }
  }
  // enemies
  for (const e of G.enemies){
    if (e.hit>0) e.hit-=dt;
    let mul = 1;
    if (e.slowUntil > G.time) mul = e.slowMul;
    e.dist += e.speed*mul*dt;
    const p = posAt(e.dist); e.x=p.x; e.y=p.y;
    if (e.dist >= PATHLEN){ e.dead=true; e.leaked=true; }
  }
  // leaks
  for (const e of G.enemies){ if (e.leaked && !e.counted){ e.counted=true; G.lives--; addFx(CRYSTAL.x,CRYSTAL.y,"-1","#ff6b6b"); } }
  // towers fire
  for (const t of G.towers){
    t.cd -= dt;
    const st = towerStat(t);
    let target=null, best=1e9;
    for (const e of G.enemies){ if (e.dead) continue;
      const dd=Math.hypot(e.x-t.x,e.y-t.y);
      if (dd<=st.range && e.dist>best*-1){ if (e.dist>-best){} }
      if (dd<=st.range){ if (e.dist> (target? target.dist:-1)){ target=e; } }
    }
    if (target){ t.angle = Math.atan2(target.y-t.y, target.x-t.x); }
    if (target && t.cd<=0){
      t.cd = st.rate;
      G.shots.push({ x:t.x, y:t.y, tx:target.x, ty:target.y, target, spd:st.pspeed,
        dmg:st.dmg, splash:st.splash, color:st.proj, slow:st.slow, slowT:st.slowT });
      t.flash=0.08;
    }
    if (t.flash>0) t.flash-=dt;
  }
  // projectiles
  for (const s of G.shots){
    const tx = s.target && !s.target.dead ? s.target.x : s.tx;
    const ty = s.target && !s.target.dead ? s.target.y : s.ty;
    s.tx=tx; s.ty=ty;
    const dx=tx-s.x, dy=ty-s.y, d=Math.hypot(dx,dy);
    const step=s.spd*dt;
    if (d<=step+6){ hitAt(s, tx, ty); s.done=true; }
    else { s.x+=dx/d*step; s.y+=dy/d*step; }
  }
  // cleanup
  G.enemies = G.enemies.filter(e=>!e.dead);
  G.shots = G.shots.filter(s=>!s.done);
  for (const f of G.fx){ f.t+=dt; f.y-=28*dt; } G.fx=G.fx.filter(f=>f.t<0.9);

  // wave end?
  if (G.running && G.spawnQ.length===0 && G.enemies.length===0){
    G.running=false;
    if (G.wave >= WAVES.length){ endGame(true); }
    else { G.gold += 25 + G.wave*4; addFx(360,700,"+"+(25+G.wave*4),"#ffce54"); }
    updateHUD(); setStartBtn();
  }
  if (G.lives<=0 && !G.over) endGame(false);
  updateHUD();
}
function hitAt(s, x, y){
  if (s.splash>0){
    for (const e of G.enemies){ if (e.dead) continue;
      if (Math.hypot(e.x-x,e.y-y)<=s.splash+e.r){ damage(e, s.dmg, s); } }
  } else if (s.target && !s.target.dead){ damage(s.target, s.dmg, s); }
  G.fx.push({x, y, t:0, kind:"spark", color:s.color});
}
function damage(e, dmg, s){
  e.hp -= dmg; e.hit=0.12;
  if (s.slow){ e.slowUntil=G.time+s.slowT; e.slowMul=s.slow; }
  if (e.hp<=0 && !e.dead){ e.dead=true; G.gold+=e.gold; addFx(e.x,e.y,"+"+e.gold,"#ffce54"); }
}
function addFx(x,y,text,color){ G.fx.push({x,y,t:0,kind:"text",text,color}); }

/* ---------- render ---------- */
function drawPath(){
  // grass base
  ctx.fillStyle="#5a9245"; ctx.fillRect(0,0,W,H);
  // subtle checker
  ctx.fillStyle="rgba(255,255,255,.04)";
  for (let y=0;y<H;y+=80) for (let x=((y/80)%2)*80;x<W;x+=160) ctx.fillRect(x,y,80,80);
  // path
  ctx.lineCap="round"; ctx.lineJoin="round";
  ctx.strokeStyle="#c9a86a"; ctx.lineWidth=88;
  ctx.beginPath(); ctx.moveTo(PATH[0].x,PATH[0].y); for(let i=1;i<PATH.length;i++)ctx.lineTo(PATH[i].x,PATH[i].y); ctx.stroke();
  ctx.strokeStyle="#e0c48c"; ctx.lineWidth=66;
  ctx.beginPath(); ctx.moveTo(PATH[0].x,PATH[0].y); for(let i=1;i<PATH.length;i++)ctx.lineTo(PATH[i].x,PATH[i].y); ctx.stroke();
  // crystal base
  const c=CRYSTAL;
  ctx.save(); ctx.translate(c.x,c.y);
  const gl=ctx.createRadialGradient(0,0,4,0,0,80); gl.addColorStop(0,"rgba(120,200,255,.55)"); gl.addColorStop(1,"rgba(120,200,255,0)");
  ctx.fillStyle=gl; ctx.beginPath(); ctx.arc(0,0,80,0,7); ctx.fill();
  if (IMG.crystal){ ctx.drawImage(IMG.crystal,-58,-72,116,116); }
  else { ctx.fillStyle="#6fd0ff"; ctx.beginPath(); ctx.moveTo(0,-46); ctx.lineTo(28,0); ctx.lineTo(0,44); ctx.lineTo(-28,0); ctx.closePath(); ctx.fill();
         ctx.strokeStyle="#2a5a80"; ctx.lineWidth=5; ctx.stroke(); }
  ctx.restore();
}
function drawSpots(){
  for (const s of SPOTS){ if (s.used) continue;
    ctx.save(); ctx.translate(s.x,s.y);
    ctx.fillStyle= (G.selSpot===s)? "rgba(255,255,255,.5)":"rgba(30,20,8,.28)";
    ctx.strokeStyle="rgba(255,255,255,.55)"; ctx.lineWidth=4; ctx.setLineDash([9,9]);
    ctx.beginPath(); ctx.arc(0,0,34,0,7); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle="rgba(255,255,255,.85)"; ctx.font="900 34px sans-serif"; ctx.textAlign="center"; ctx.textBaseline="middle";
    ctx.fillText("+",0,2); ctx.restore();
  }
}
function drawTower(t){
  const st=towerStat(t), d=TOWERS[t.type];
  ctx.save(); ctx.translate(t.x,t.y);
  // base pad
  ctx.fillStyle="rgba(30,20,8,.35)"; ctx.beginPath(); ctx.ellipse(0,14,40,20,0,0,7); ctx.fill();
  const img = IMG["tower_"+t.type];
  if (img){
    ctx.save(); ctx.rotate(t.angle+Math.PI/2);
    const sz = 92 + (t.lvl-1)*8; ctx.drawImage(img,-sz/2,-sz/2,sz,sz); ctx.restore();
  } else {
    ctx.fillStyle=d.color; ctx.beginPath(); ctx.arc(0,0,30,0,7); ctx.fill();
    ctx.strokeStyle="#1a1a1a"; ctx.lineWidth=5; ctx.stroke();
    ctx.save(); ctx.rotate(t.angle); ctx.fillStyle="#2a2a2a"; ctx.fillRect(0,-8,44,16); ctx.restore();
  }
  if (t.flash>0){ ctx.fillStyle="rgba(255,255,220,.8)"; ctx.save(); ctx.rotate(t.angle);
    ctx.beginPath(); ctx.arc(46,0,12,0,7); ctx.fill(); ctx.restore(); }
  // level pips
  for (let i=0;i<t.lvl;i++){ ctx.fillStyle="#ffce54"; ctx.beginPath(); ctx.arc(-18+i*18,-40,6,0,7); ctx.fill();
    ctx.strokeStyle="#7a4e12"; ctx.lineWidth=2; ctx.stroke(); }
  ctx.restore();
}
function drawEnemy(e){
  const def=ENEMIES[e.type];
  ctx.save(); ctx.translate(e.x,e.y);
  ctx.fillStyle="rgba(0,0,0,.22)"; ctx.beginPath(); ctx.ellipse(0,e.r*0.7,e.r*0.9,e.r*0.4,0,0,7); ctx.fill();
  const img=IMG[def.img];
  if (img){ const s=e.r*2.3; if(e.hit>0){ctx.globalAlpha=1;} ctx.drawImage(img,-s/2,-s/2,s,s);
    if (e.hit>0){ ctx.globalCompositeOperation="source-atop"; ctx.fillStyle="rgba(255,255,255,.7)"; ctx.fillRect(-s/2,-s/2,s,s); ctx.globalCompositeOperation="source-over"; } }
  else { ctx.fillStyle= e.hit>0? "#fff": def.color; ctx.beginPath(); ctx.arc(0,0,e.r,0,7); ctx.fill();
         ctx.strokeStyle="#1a1a1a"; ctx.lineWidth=4; ctx.stroke(); }
  if (e.slowUntil>G.time){ ctx.strokeStyle="rgba(126,200,255,.9)"; ctx.lineWidth=3; ctx.beginPath(); ctx.arc(0,0,e.r+4,0,7); ctx.stroke(); }
  ctx.restore();
  // hp bar
  const w=e.r*2, hpp=Math.max(0,e.hp/e.maxhp);
  ctx.fillStyle="rgba(0,0,0,.5)"; ctx.fillRect(e.x-w/2,e.y-e.r-16,w,7);
  ctx.fillStyle= hpp>0.5?"#7ed957":hpp>0.25?"#ffce54":"#ff5e6b"; ctx.fillRect(e.x-w/2,e.y-e.r-16,w*hpp,7);
}
function render(){
  ctx.clearRect(0,0,W,H);
  drawPath(); drawSpots();
  // range preview
  if (G.selTower){ const st=towerStat(G.selTower); ctx.fillStyle="rgba(255,255,255,.10)"; ctx.strokeStyle="rgba(255,255,255,.4)"; ctx.lineWidth=3;
    ctx.beginPath(); ctx.arc(G.selTower.x,G.selTower.y,st.range,0,7); ctx.fill(); ctx.stroke(); }
  for (const t of G.towers) drawTower(t);
  for (const e of G.enemies) drawEnemy(e);
  for (const s of G.shots){ ctx.fillStyle=s.color; ctx.beginPath(); ctx.arc(s.x,s.y,s.splash>0?9:6,0,7); ctx.fill();
    ctx.strokeStyle="rgba(0,0,0,.4)"; ctx.lineWidth=2; ctx.stroke(); }
  for (const f of G.fx){
    if (f.kind==="spark"){ ctx.globalAlpha=Math.max(0,1-f.t/0.4); ctx.fillStyle=f.color;
      ctx.beginPath(); ctx.arc(f.x,f.y,6+f.t*40,0,7); ctx.fill(); ctx.globalAlpha=1; }
    else { ctx.globalAlpha=Math.max(0,1-f.t/0.9); ctx.fillStyle=f.color; ctx.font="900 30px sans-serif"; ctx.textAlign="center";
      ctx.strokeStyle="rgba(0,0,0,.5)"; ctx.lineWidth=4; ctx.strokeText(f.text,f.x,f.y); ctx.fillText(f.text,f.x,f.y); ctx.globalAlpha=1; }
  }
}

/* ---------- loop ---------- */
let last=0;
function loop(ts){
  const dt=Math.min(0.05,(ts-last)/1000)||0; last=ts;
  G.time=(G.time||0)+dt*G.speed;
  if (!G.over) for (let i=0;i<G.speed;i++) update(dt);
  render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

/* ---------- input ---------- */
function toLogical(clientX, clientY){
  const r=canvas.getBoundingClientRect();
  return { x:(clientX-r.left)/scale, y:(clientY-r.top)/scale };
}
canvas.addEventListener("pointerdown", ev=>{
  if (!G || G.over) return;
  const p=toLogical(ev.clientX, ev.clientY);
  // tower?
  for (const t of G.towers){ if (Math.hypot(p.x-t.x,p.y-t.y)<44){ openManage(t); return; } }
  // spot?
  for (const s of SPOTS){ if (!s.used && Math.hypot(p.x-s.x,p.y-s.y)<40){ openBuild(s); return; } }
  closeSheets();
});

/* ---------- UI ---------- */
const $=id=>document.getElementById(id);
function updateHUD(){ $("lives").textContent=Math.max(0,G.lives); $("gold").textContent=G.gold;
  $("wave").textContent=G.wave+"/"+WAVES.length; }
function setStartBtn(){ const b=$("startBtn");
  if (G.running){ b.textContent="⚔ WAVE "+G.wave; b.classList.add("running"); }
  else if (G.wave>=WAVES.length){ b.textContent="✓ CLEARED"; b.classList.remove("running"); }
  else { b.textContent="▶ START WAVE "+(G.wave+1); b.classList.remove("running"); }
}
function openBuild(spot){
  closeSheets(); G.selSpot=spot;
  const list=$("towerList"); list.innerHTML="";
  for (const key in TOWERS){ const d=TOWERS[key];
    const can=G.gold>=d.cost;
    const el=document.createElement("div"); el.className="tw"+(can?"":" cant");
    el.innerHTML=`<canvas class="tw-ico" data-t="${key}" width="64" height="64"></canvas>
      <div class="tw-name">${d.name}</div><div class="tw-cost">🪙 ${d.cost}</div><div class="tw-desc">${d.desc}</div>`;
    el.onclick=()=>{ if (buildTower(spot,key)){ closeSheets(); } };
    list.appendChild(el);
    drawTowerIcon(el.querySelector("canvas"), key);
  }
  $("buildSheet").classList.remove("hidden");
}
function drawTowerIcon(cv, key){
  const c=cv.getContext("2d"); const img=IMG["tower_"+key];
  if (img) c.drawImage(img,2,2,60,60);
  else { c.fillStyle=TOWERS[key].color; c.beginPath(); c.arc(32,32,22,0,7); c.fill(); c.strokeStyle="#1a1a1a"; c.lineWidth=3; c.stroke(); }
}
function openManage(t){
  closeSheets(); G.selTower=t;
  $("mgTitle").textContent=TOWERS[t.type].name+"  ·  Lv "+t.lvl;
  const st=towerStat(t);
  $("mgInfo").innerHTML=`Damage <b>${Math.round(st.dmg)}</b> · Range <b>${Math.round(st.range)}</b>`+
    (t.type==="frost"?` · Slow`:"")+`<br>Total spent <b>🪙 ${t.spent}</b>`;
  const uc=upgradeCost(t), ub=$("upgradeBtn");
  ub.textContent="⬆ Upgrade  🪙"+uc;
  ub.classList.toggle("cant", G.gold<uc || t.lvl>=4);
  if (t.lvl>=4) ub.textContent="MAX LEVEL";
  ub.onclick=()=>{ if (t.lvl<4 && G.gold>=uc){ G.gold-=uc; t.lvl++; t.spent+=uc; updateHUD(); openManage(t); } };
  $("sellBtn").textContent="Sell 🪙"+Math.round(t.spent*0.6);
  $("sellBtn").onclick=()=>{ G.gold+=Math.round(t.spent*0.6); t.spot.used=false;
    G.towers=G.towers.filter(x=>x!==t); updateHUD(); closeSheets(); };
  $("manageSheet").classList.remove("hidden");
}
function closeSheets(){ $("buildSheet").classList.add("hidden"); $("manageSheet").classList.add("hidden");
  G.selSpot=null; G.selTower=null; }
$("buildClose").onclick=closeSheets; $("manageClose").onclick=closeSheets;
$("startBtn").onclick=()=>{ closeSheets(); startWave(); };
$("speedBtn").onclick=()=>{ G.speed = G.speed===1?2:1; $("speedBtn").textContent=G.speed+"×"; };

/* ---------- overlay / end ---------- */
function endGame(win){
  G.over=true; G.win=win; G.running=false;
  const t=$("ovTitle"), s=$("ovSub");
  t.className="ov-title "+(win?"win":"lose");
  t.innerHTML = win? "VICTORY!" : "DEFEATED";
  s.innerHTML = win? `You cleared all ${WAVES.length} waves!<br>The crystal is safe.` :
                     `The crystal fell on wave ${G.wave}.<br>Try a new strategy!`;
  $("ovBtn").textContent="PLAY AGAIN";
  $("overlay").classList.remove("hidden");
}
$("ovBtn").onclick=()=>{ $("overlay").classList.add("hidden"); newGame(); updateHUD(); setStartBtn(); };
updateHUD(); setStartBtn();
