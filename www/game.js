"use strict";
/* Kingdom Guard — multi-level tower defense. Menu → Level Select → Battle → Result.
   5 maps (themes), 5 towers, 6 enemies, procedural scaling waves, juice + sound, star progression. */

const W = 720, H = 1280;
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
let scale=1;
function fit(){ const vw=innerWidth, vh=innerHeight; scale=Math.min(vw/W,vh/H);
  canvas.width=W; canvas.height=H; canvas.style.width=(W*scale)+"px"; canvas.style.height=(H*scale)+"px"; }
addEventListener("resize",fit); fit();

/* ---------- assets ---------- */
const IMG={};
const AL={ enemy_slime:"img/enemy_slime.png",enemy_runner:"img/enemy_runner.png",enemy_tank:"img/enemy_tank.png",
  enemy_boss:"img/enemy_boss.png",tower_cannon:"img/tower_cannon.png",tower_archer:"img/tower_archer.png",
  tower_frost:"img/tower_frost.png",tower_poison:"img/tower_poison.png",tower_tesla:"img/tower_tesla.png",crystal:"img/crystal.png" };
// white-tinted silhouette cache (for hit flash — clipped to sprite, never the background)
const IMGW={};
function makeWhite(im){ const c=document.createElement("canvas"); c.width=im.width; c.height=im.height;
  const x=c.getContext("2d"); x.drawImage(im,0,0); x.globalCompositeOperation="source-atop";
  x.fillStyle="#fff"; x.fillRect(0,0,c.width,c.height); return c; }
for (const k in AL){ const im=new Image(); im.onload=()=>{ IMG[k]=im; if(k.startsWith("enemy_")) IMGW[k]=makeWhite(im); }; im.src=AL[k]; }

/* ---------- themes / maps ---------- */
const THEMES={
  grass:{ g1:"#5a9245",g2:"#4a7a3a",path:"#c9a86a",path2:"#e0c48c",name:"Green Meadow" },
  desert:{ g1:"#d9b878",g2:"#c8a660",path:"#a9824c",path2:"#caa06a",name:"Sun Dunes" },
  snow:{ g1:"#cfe0ea",g2:"#b6ccd8",path:"#9db3c2",path2:"#c3d6e2",name:"Frost Peak" },
  swamp:{ g1:"#4f6b3f",g2:"#3d5531",path:"#6b5a3a",path2:"#87724a",name:"Murk Bog" },
  volcano:{ g1:"#4a2a24",g2:"#361d19",path:"#6b3a2a",path2:"#8a4a34",name:"Ash Crater" },
};
// each map: theme, path waypoints (enter top → crystal), buildable spots
const MAPS=[
 { theme:"grass", path:[[360,-60],[360,190],[565,190],[565,430],[165,430],[165,665],[565,665],[565,900],[360,900],[360,1110]],
   spots:[[470,110],[250,300],[670,310],[70,545],[280,545],[665,545],[455,780],[250,790],[665,790],[250,1010],[470,1010]] },
 { theme:"desert", path:[[120,-60],[120,240],[600,240],[600,520],[120,520],[120,800],[600,800],[600,1110]],
   spots:[[330,120],[360,360],[110,660],[360,660],[610,660],[330,930],[480,1000],[240,1000],[110,380],[610,380]] },
 { theme:"snow", path:[[360,-60],[360,160],[150,160],[150,400],[570,400],[570,640],[150,640],[150,880],[570,880],[570,1110]],
   spots:[[260,80],[300,280],[460,520],[300,520],[300,760],[460,760],[460,1000],[70,400],[665,640],[665,1000]] },
 { theme:"swamp", path:[[360,-60],[360,300],[120,300],[120,600],[600,600],[600,300],[420,300],[420,1110]],
   spots:[[250,180],[240,450],[360,720],[540,450],[240,900],[560,900],[110,760],[620,760],[560,180],[110,180]] },
 { theme:"volcano", path:[[80,-60],[80,200],[360,200],[360,460],[640,460],[640,720],[360,720],[360,980],[80,980],[80,1110]],
   spots:[[240,120],[510,340],[490,600],[230,600],[510,860],[230,860],[640,980],[80,460],[640,200],[240,1000]] },
];

/* ---------- towers / enemies ---------- */
const TOWERS={
  cannon:{name:"Cannon",cost:45,range:165,dmg:26,rate:0.95,splash:48,proj:"#2a2a2a",pspeed:640,color:"#3aa0c0",img:"tower_cannon",desc:"Splash damage",sfx:"shoot"},
  archer:{name:"Archer",cost:32,range:205,dmg:11,rate:0.32,splash:0,proj:"#ffe08a",pspeed:820,color:"#8fe36a",img:"tower_archer",desc:"Fast shots",sfx:"shootArcher"},
  frost:{name:"Frost",cost:55,range:150,dmg:7,rate:0.8,splash:0,proj:"#bfeaff",pspeed:700,color:"#7ec8ff",img:"tower_frost",slow:0.5,slowT:1.6,desc:"Slows enemies",sfx:"shootFrost"},
  poison:{name:"Poison",cost:60,range:170,dmg:6,rate:1.0,splash:0,proj:"#9be36a",pspeed:600,color:"#7bc043",img:"tower_poison",dot:14,dotT:3,desc:"Damage over time",sfx:"shootArcher"},
  tesla:{name:"Tesla",cost:80,range:160,dmg:16,rate:0.7,splash:0,proj:"#c8f0ff",pspeed:1200,color:"#c88bff",img:"tower_tesla",chain:3,desc:"Chain lightning",sfx:"shootFrost"},
};
const TKEYS=["cannon","archer","frost","poison","tesla"];
const ENEMIES={
  slime:{hp:60,speed:56,gold:6,r:26,img:"enemy_slime",color:"#7ed957"},
  runner:{hp:42,speed:120,gold:7,r:21,img:"enemy_runner",color:"#ffd76b"},
  tank:{hp:320,speed:40,gold:16,r:34,img:"enemy_tank",color:"#c58bff"},
  shield:{hp:150,speed:52,gold:14,r:28,img:"enemy_tank",color:"#9fb4c8",armor:0.4},
  flyer:{hp:70,speed:95,gold:10,r:22,img:"enemy_runner",color:"#ff9ee0",fly:true},
  boss:{hp:1700,speed:32,gold:130,r:48,img:"enemy_boss",color:"#ff5e6b",armor:0.2},
};

/* ---------- progression ---------- */
function loadProg(){ try{return JSON.parse(localStorage.getItem("kg.prog"))||{stars:{},unlocked:1};}catch(e){return {stars:{},unlocked:1};} }
function saveProg(p){ localStorage.setItem("kg.prog", JSON.stringify(p)); }
let PROG=loadProg();

/* ---------- wave generator (per level) ---------- */
function makeWaves(lvl){
  const N=12, out=[];
  for (let w=1;w<=N;w++){
    const groups=[]; const diff=1+lvl*0.25;
    groups.push({t:"slime",n:Math.round((5+w*1.2)*diff),gap:Math.max(0.28,0.8-w*0.03)});
    if (w>=2) groups.push({t:"runner",n:Math.round((2+w*0.9)*diff),gap:0.4});
    if (w>=4 && w%2===0) groups.push({t:"tank",n:Math.round(1+w*0.35),gap:1.0});
    if (w>=5 && lvl>=1) groups.push({t:"shield",n:Math.round(w*0.5),gap:0.7});
    if (w>=6 && lvl>=2) groups.push({t:"flyer",n:Math.round(2+w*0.6),gap:0.4});
    if (w===N) groups.unshift({t:"boss",n:1+Math.floor(lvl/2),gap:2});
    out.push(groups);
  }
  return out;
}

/* ---------- game state ---------- */
let SCREEN="menu";      // menu | levels | game
let G=null, LEVEL=0, THEME=THEMES.grass, PATH=[], SEG=[], PATHLEN=0, SPOTS=[], WAVES=[];
let shakeT=0, shakeMag=0;

function setLevel(lvl){
  LEVEL=lvl; const m=MAPS[lvl]; THEME=THEMES[m.theme];
  PATH=m.path.map(p=>({x:p[0],y:p[1]}));
  SPOTS=m.path && m.spots.map(s=>({x:s[0],y:s[1],used:false}));
  SEG=[]; PATHLEN=0;
  for(let i=0;i<PATH.length-1;i++){const dx=PATH[i+1].x-PATH[i].x,dy=PATH[i+1].y-PATH[i].y,l=Math.hypot(dx,dy);SEG.push({len:l,a:PATH[i],b:PATH[i+1]});PATHLEN+=l;}
  WAVES=makeWaves(lvl);
}
function posAt(d){ let x=d; for(const s of SEG){ if(x<=s.len){const t=x/s.len;return{x:s.a.x+(s.b.x-s.a.x)*t,y:s.a.y+(s.b.y-s.a.y)*t};}x-=s.len;} const e=PATH[PATH.length-1];return{x:e.x,y:e.y}; }
const CRYSTAL=()=>PATH[PATH.length-1];

function newGame(lvl){
  setLevel(lvl);
  G={gold:130,lives:20,wave:0,running:false,over:false,win:false,time:0,speed:1,score:0,
     enemies:[],towers:[],shots:[],fx:[],parts:[],spawnQ:[],spawnT:0,combo:0,comboT:0,leaks:0};
  SCREEN="game"; shakeT=0;
  updateHUD(); setStartBtn(); showScreen();
}

/* ---------- waves / spawn ---------- */
function startWave(){
  if(!G||G.running||G.over||G.wave>=WAVES.length) return;
  const gs=WAVES[G.wave]; G.spawnQ=[];
  for(const g of gs) for(let i=0;i<g.n;i++) G.spawnQ.push({t:g.t,delay:g.gap});
  G.wave++; G.running=true; G.spawnT=0; SND.play("wave"); updateHUD(); setStartBtn();
}
function spawn(type){
  const e=ENEMIES[type], hp=e.hp*(1+(G.wave-1)*0.11+LEVEL*0.12);
  G.enemies.push({type,x:PATH[0].x,y:PATH[0].y,dist:0,hp,maxhp:hp,speed:e.speed,r:e.r,gold:e.gold,
    armor:e.armor||0,fly:e.fly||false,slowU:0,slowMul:1,dotU:0,dotDmg:0,hit:0});
}

/* ---------- towers ---------- */
function buildTower(spot,type){
  const d=TOWERS[type]; if(G.gold<d.cost||spot.used) return false;
  G.gold-=d.cost; spot.used=true;
  G.towers.push({x:spot.x,y:spot.y,type,lvl:1,cd:0,angle:-Math.PI/2,spot,spent:d.cost,flash:0});
  SND.play("build"); updateHUD(); return true;
}
function tstat(t){ const d=TOWERS[t.type],m=1+(t.lvl-1)*0.45;
  return {range:d.range*(1+(t.lvl-1)*0.1),dmg:d.dmg*m,rate:d.rate,splash:d.splash,pspeed:d.pspeed,proj:d.proj,
    slow:d.slow,slowT:d.slowT,dot:d.dot,dotT:d.dotT,chain:d.chain,sfx:d.sfx}; }
function upCost(t){ return Math.round(TOWERS[t.type].cost*(0.8+t.lvl*0.55)); }

/* ---------- update ---------- */
function update(dt){
  if(shakeT>0) shakeT-=dt;
  if(G.comboT>0){ G.comboT-=dt; if(G.comboT<=0) G.combo=0; }
  // particles
  for(const p of G.parts){ p.t+=dt; p.x+=p.vx*dt; p.y+=p.vy*dt;
    if(p.kind==="smoke"){ p.vx*=0.9; p.vy=p.vy*0.9-10*dt; p.r+=(p.grow||40)*dt; }
    else { p.vy+=(p.grav||220)*dt; p.vx*=0.95; } }
  G.parts=G.parts.filter(p=>p.t<p.life);
  for(const f of G.fx){ f.t+=dt; if(f.kind==="text") f.y-=30*dt; }
  G.fx=G.fx.filter(f=>f.t<(f.life||0.9));
  if(!G.running) return;
  if(G.spawnQ.length){ G.spawnT-=dt; if(G.spawnT<=0){const s=G.spawnQ.shift();spawn(s.t);G.spawnT=s.delay;} }
  // enemies
  for(const e of G.enemies){
    if(e.hit>0)e.hit-=dt;
    if(e.dotU>G.time){ e.hp-=e.dotDmg*dt; if(e.hp<=0&&!e.dead) killEnemy(e); }
    let mul=e.slowU>G.time?e.slowMul:1;
    e.dist+=e.speed*mul*dt; const p=posAt(e.dist); e.x=p.x; e.y=p.y;
    if(e.dist>=PATHLEN&&!e.dead){ e.dead=true; G.lives--; G.leaks++; SND.play("leak"); shake(6); addFx(CRYSTAL().x,CRYSTAL().y,"-1","#ff6b6b"); }
  }
  // towers
  for(const t of G.towers){
    t.cd-=dt; if(t.flash>0)t.flash-=dt;
    const st=tstat(t); let target=null,bestDist=-1;
    for(const e of G.enemies){ if(e.dead)continue; const dd=Math.hypot(e.x-t.x,e.y-t.y);
      if(dd<=st.range && e.dist>bestDist){ bestDist=e.dist; target=e; } }
    if(target){ t.angle=Math.atan2(target.y-t.y,target.x-t.x);
      if(t.cd<=0){ t.cd=st.rate; t.flash=0.08; SND.play(st.sfx);
        G.shots.push({x:t.x,y:t.y,target,spd:st.pspeed,dmg:st.dmg,splash:st.splash,color:st.proj,
          slow:st.slow,slowT:st.slowT,dot:st.dot,dotT:st.dotT,chain:st.chain,tx:target.x,ty:target.y}); } }
  }
  // projectiles
  for(const s of G.shots){
    const tx=s.target&&!s.target.dead?s.target.x:s.tx, ty=s.target&&!s.target.dead?s.target.y:s.ty; s.tx=tx;s.ty=ty;
    const dx=tx-s.x,dy=ty-s.y,d=Math.hypot(dx,dy),step=s.spd*dt;
    if(d<=step+6){ impact(s,tx,ty); s.done=true; } else { s.x+=dx/d*step; s.y+=dy/d*step; }
  }
  G.enemies=G.enemies.filter(e=>!e.dead); G.shots=G.shots.filter(s=>!s.done);
  if(G.running&&!G.spawnQ.length&&!G.enemies.length){
    G.running=false;
    if(G.wave>=WAVES.length) endGame(true);
    else { const bonus=25+G.wave*5; G.gold+=bonus; addFx(360,640,"+"+bonus,"#ffce54"); SND.play("coin"); }
    updateHUD(); setStartBtn();
  }
  if(G.lives<=0&&!G.over) endGame(false);
  updateHUD();
}
function impact(s,x,y){
  if(s.splash>0){ SND.play("boom",1+Math.min(1,G.combo*0.05)); shake(4); explode(x,y,1.0,"#ffb14a");
    for(const e of G.enemies){ if(!e.dead&&Math.hypot(e.x-x,e.y-y)<=s.splash+e.r) damage(e,s.dmg,s); } }
  else if(s.chain){ let hits=[s.target]; damage(s.target,s.dmg,s);
    let last=s.target;
    for(let c=1;c<s.chain;c++){ let nxt=null,bd=140;
      for(const e of G.enemies){ if(e.dead||hits.includes(e))continue; const dd=Math.hypot(e.x-last.x,e.y-last.y); if(dd<bd){bd=dd;nxt=e;} }
      if(!nxt)break; s._arc=s._arc||[]; hits.push(nxt); damage(nxt,s.dmg*0.7,s); last=nxt; }
    G.fx.push({kind:"chain",pts:hits.map(e=>({x:e.x,y:e.y})),from:{x:s.x,y:s.y},t:0,color:s.color});
  }
  else if(s.target&&!s.target.dead) damage(s.target,s.dmg,s);
  G.fx.push({kind:"spark",x,y,t:0,color:s.color});
}
function damage(e,dmg,s){
  const d=dmg*(1-(e.armor||0)); e.hp-=d; e.hit=0.12; SND.play("hit");
  if(s.slow){ e.slowU=G.time+s.slowT; e.slowMul=s.slow; }
  if(s.dot){ e.dotU=G.time+s.dotT; e.dotDmg=s.dot; }
  if(e.hp<=0&&!e.dead) killEnemy(e);
}
function killEnemy(e){
  e.dead=true; G.gold+=e.gold; G.combo++; G.comboT=2.2; G.score=(G.score||0)+e.gold*10+G.combo*2;
  if(e.type==="boss"){ SND.play("boom",2.1); explode(e.x,e.y,2.4,"#ffce54"); shake(15); }
  else { SND.play("die",G.combo); explode(e.x,e.y,(e.type==="tank"||e.type==="shield")?1.35:0.85,ENEMIES[e.type].color); }
  addFx(e.x,e.y,"+"+e.gold,"#ffce54");
  if(G.combo>=5&&G.combo%5===0){ addFx(e.x,e.y-30,"COMBO x"+G.combo,"#ff9ee0"); SND.play("star"); }
}
function shake(m){ shakeT=0.25; shakeMag=m; }
// real explosion: white-hot core + orange embers + dark smoke + shockwave ring
const EMBER=["#fff4c0","#ffd27a","#ffb14a","#ff7a2a","#ff4d2a"];
function explode(x,y,power,tint){
  const em=Math.round(9*power);
  for(let i=0;i<em;i++){ const a=Math.random()*7,sp=(70+Math.random()*240)*power;
    G.parts.push({kind:"ember",x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,t:0,life:0.3+Math.random()*0.45,
      color:EMBER[(Math.random()*EMBER.length)|0],r:(2.4+Math.random()*3.6)*power,grav:200}); }
  const sm=Math.round(4*power);
  for(let i=0;i<sm;i++){ const a=Math.random()*7,sp=18+Math.random()*46;
    G.parts.push({kind:"smoke",x:x+(Math.random()-.5)*14,y:y+(Math.random()-.5)*14,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp-28,
      t:0,life:0.55+Math.random()*0.5,color:Math.random()<0.5?"#3a2c24":"#54463d",r:(7+Math.random()*7)*power,grow:46}); }
  G.fx.push({kind:"ring",x,y,t:0,life:0.34,r0:6*power,r1:64*power,color:tint||"#ffce7a"});
  G.fx.push({kind:"flash",x,y,t:0,life:0.14,r:34*power});
}
// legacy hook — small colored spark burst still routes through explode
function burst(x,y,n,color){ explode(x,y, n>=20?1.9:(n>=8?1.0:0.7), color); }
function addFx(x,y,text,color){ G.fx.push({kind:"text",x,y,t:0,text,color}); }

/* ---------- render ---------- */
function drawBoard(){
  ctx.fillStyle=THEME.g1; ctx.fillRect(0,0,W,H);
  ctx.fillStyle="rgba(255,255,255,.05)";
  for(let y=0;y<H;y+=80) for(let x=((y/80)%2)*80;x<W;x+=160) ctx.fillRect(x,y,80,80);
  ctx.lineCap="round"; ctx.lineJoin="round";
  ctx.strokeStyle=THEME.path; ctx.lineWidth=88;
  ctx.beginPath(); ctx.moveTo(PATH[0].x,PATH[0].y); for(let i=1;i<PATH.length;i++)ctx.lineTo(PATH[i].x,PATH[i].y); ctx.stroke();
  ctx.strokeStyle=THEME.path2; ctx.lineWidth=66;
  ctx.beginPath(); ctx.moveTo(PATH[0].x,PATH[0].y); for(let i=1;i<PATH.length;i++)ctx.lineTo(PATH[i].x,PATH[i].y); ctx.stroke();
  const c=CRYSTAL(); ctx.save(); ctx.translate(c.x,c.y);
  const gl=ctx.createRadialGradient(0,0,4,0,0,80); gl.addColorStop(0,"rgba(120,200,255,.55)"); gl.addColorStop(1,"rgba(120,200,255,0)");
  ctx.fillStyle=gl; ctx.beginPath(); ctx.arc(0,0,80,0,7); ctx.fill();
  if(IMG.crystal) ctx.drawImage(IMG.crystal,-58,-72,116,116);
  ctx.restore();
}
function drawSpots(){
  for(const s of SPOTS){ if(s.used)continue; ctx.save(); ctx.translate(s.x,s.y);
    ctx.fillStyle=G.selSpot===s?"rgba(255,255,255,.5)":"rgba(30,20,8,.26)";
    ctx.strokeStyle="rgba(255,255,255,.55)"; ctx.lineWidth=4; ctx.setLineDash([9,9]);
    ctx.beginPath(); ctx.arc(0,0,32,0,7); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle="rgba(255,255,255,.85)"; ctx.font="900 32px sans-serif"; ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.fillText("+",0,2); ctx.restore(); }
}
function drawTower(t){ const d=TOWERS[t.type]; ctx.save(); ctx.translate(t.x,t.y);
  ctx.fillStyle="rgba(30,20,8,.32)"; ctx.beginPath(); ctx.ellipse(0,14,38,19,0,0,7); ctx.fill();
  const img=IMG[d.img];
  if(img){ ctx.save(); ctx.rotate(t.angle+Math.PI/2); const sz=88+(t.lvl-1)*7; ctx.drawImage(img,-sz/2,-sz/2,sz,sz); ctx.restore(); }
  else { ctx.fillStyle=d.color; ctx.beginPath(); ctx.arc(0,0,28,0,7); ctx.fill(); ctx.save(); ctx.rotate(t.angle); ctx.fillStyle="#2a2a2a"; ctx.fillRect(0,-7,40,14); ctx.restore(); }
  if(t.flash>0){ ctx.save(); ctx.rotate(t.angle); ctx.fillStyle="rgba(255,255,220,.85)"; ctx.beginPath(); ctx.arc(44,0,11,0,7); ctx.fill(); ctx.restore(); }
  for(let i=0;i<t.lvl;i++){ ctx.fillStyle="#ffce54"; ctx.beginPath(); ctx.arc(-18+i*16,-40,5.5,0,7); ctx.fill(); ctx.strokeStyle="#7a4e12"; ctx.lineWidth=2; ctx.stroke(); }
  ctx.restore();
}
function drawEnemy(e){ const def=ENEMIES[e.type]; ctx.save(); ctx.translate(e.x,e.y);
  if(e.fly) ctx.translate(0,-14);
  ctx.fillStyle="rgba(0,0,0,.22)"; ctx.beginPath(); ctx.ellipse(0,e.r*0.7+(e.fly?14:0),e.r*0.9,e.r*0.4,0,0,7); ctx.fill();
  const img=IMG[def.img];
  if(img){ const s=e.r*2.3; ctx.drawImage(img,-s/2,-s/2,s,s);
    if(e.armor>0.3){ ctx.strokeStyle="rgba(180,200,220,.9)"; ctx.lineWidth=4; ctx.beginPath(); ctx.arc(0,0,e.r+2,0,7); ctx.stroke(); }
    if(e.hit>0 && IMGW[def.img]){ ctx.globalAlpha=Math.min(0.85,e.hit/0.12*0.85); ctx.drawImage(IMGW[def.img],-s/2,-s/2,s,s); ctx.globalAlpha=1; } }
  else { ctx.fillStyle=e.hit>0?"#fff":def.color; ctx.beginPath(); ctx.arc(0,0,e.r,0,7); ctx.fill(); }
  if(e.slowU>G.time){ ctx.strokeStyle="rgba(126,200,255,.9)"; ctx.lineWidth=3; ctx.beginPath(); ctx.arc(0,0,e.r+4,0,7); ctx.stroke(); }
  if(e.dotU>G.time){ ctx.fillStyle="rgba(123,192,67,.5)"; ctx.beginPath(); ctx.arc(0,0,e.r+2,0,7); ctx.fill(); }
  ctx.restore();
  const w=e.r*2,hpp=Math.max(0,e.hp/e.maxhp),yy=e.y-e.r-16-(e.fly?14:0);
  ctx.fillStyle="rgba(0,0,0,.5)"; ctx.fillRect(e.x-w/2,yy,w,7);
  ctx.fillStyle=hpp>.5?"#7ed957":hpp>.25?"#ffce54":"#ff5e6b"; ctx.fillRect(e.x-w/2,yy,w*hpp,7);
}
function render(){
  ctx.save();
  if(shakeT>0){ const m=shakeMag*(shakeT/0.25); ctx.translate((Math.random()-.5)*m,(Math.random()-.5)*m); }
  ctx.clearRect(-20,-20,W+40,H+40);
  drawBoard(); drawSpots();
  if(G.selTower){ const st=tstat(G.selTower); ctx.fillStyle="rgba(255,255,255,.1)"; ctx.strokeStyle="rgba(255,255,255,.4)"; ctx.lineWidth=3;
    ctx.beginPath(); ctx.arc(G.selTower.x,G.selTower.y,st.range,0,7); ctx.fill(); ctx.stroke(); }
  for(const t of G.towers) drawTower(t);
  for(const e of G.enemies) drawEnemy(e);
  for(const s of G.shots){ ctx.fillStyle=s.color; ctx.beginPath(); ctx.arc(s.x,s.y,s.splash>0?9:6,0,7); ctx.fill(); }
  // smoke first (behind), then additive embers (glowing)
  for(const p of G.parts){ if(p.kind!=="smoke")continue; const k=p.t/p.life;
    ctx.globalAlpha=Math.max(0,(1-k))*0.45; ctx.fillStyle=p.color; ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,7); ctx.fill(); }
  ctx.globalCompositeOperation="lighter";
  for(const p of G.parts){ if(p.kind==="smoke")continue; const k=p.t/p.life;
    ctx.globalAlpha=Math.max(0,1-k); ctx.fillStyle=p.color; ctx.beginPath(); ctx.arc(p.x,p.y,p.r*(1-k*0.55),0,7); ctx.fill(); }
  ctx.globalCompositeOperation="source-over"; ctx.globalAlpha=1;
  for(const f of G.fx){
    if(f.kind==="flash"){ const k=f.t/f.life; if(k<1){ ctx.globalCompositeOperation="lighter"; ctx.globalAlpha=(1-k);
      const g=ctx.createRadialGradient(f.x,f.y,0,f.x,f.y,f.r); g.addColorStop(0,"#fff7d8"); g.addColorStop(.5,"#ffce7a"); g.addColorStop(1,"rgba(255,140,60,0)");
      ctx.fillStyle=g; ctx.beginPath(); ctx.arc(f.x,f.y,f.r,0,7); ctx.fill(); ctx.globalCompositeOperation="source-over"; ctx.globalAlpha=1; } }
    else if(f.kind==="ring"){ const k=f.t/f.life; if(k<1){ ctx.globalAlpha=(1-k)*0.85; ctx.strokeStyle=f.color; ctx.lineWidth=7*(1-k)+1.5;
      ctx.beginPath(); ctx.arc(f.x,f.y,f.r0+(f.r1-f.r0)*k,0,7); ctx.stroke(); ctx.globalAlpha=1; } }
    else if(f.kind==="spark"){ ctx.globalAlpha=Math.max(0,1-f.t/.4); ctx.fillStyle=f.color; ctx.beginPath(); ctx.arc(f.x,f.y,6+f.t*40,0,7); ctx.fill(); ctx.globalAlpha=1; }
    else if(f.kind==="chain"){ ctx.globalAlpha=Math.max(0,1-f.t/.25); ctx.strokeStyle=f.color; ctx.lineWidth=4;
      ctx.beginPath(); ctx.moveTo(f.from.x,f.from.y); for(const p of f.pts) ctx.lineTo(p.x,p.y); ctx.stroke(); ctx.globalAlpha=1; }
    else { ctx.globalAlpha=Math.max(0,1-f.t/.9); ctx.fillStyle=f.color; ctx.font="900 30px sans-serif"; ctx.textAlign="center";
      ctx.strokeStyle="rgba(0,0,0,.5)"; ctx.lineWidth=4; ctx.strokeText(f.text,f.x,f.y); ctx.fillText(f.text,f.x,f.y); ctx.globalAlpha=1; }
  }
  ctx.restore();
}

/* ---------- loop ---------- */
let last=0;
function loop(ts){ const dt=Math.min(0.05,(ts-last)/1000)||0; last=ts;
  if(SCREEN==="game"&&G){ G.time+=dt*G.speed; if(!G.over){ for(let i=0;i<G.speed;i++) update(dt); } render(); }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

/* ---------- input ---------- */
function toLogical(cx,cy){ const r=canvas.getBoundingClientRect(); return {x:(cx-r.left)/scale,y:(cy-r.top)/scale}; }
canvas.addEventListener("pointerdown",ev=>{ if(SCREEN!=="game"||!G||G.over) return;
  const p=toLogical(ev.clientX,ev.clientY);
  for(const t of G.towers){ if(Math.hypot(p.x-t.x,p.y-t.y)<42){ openManage(t); return; } }
  for(const s of SPOTS){ if(!s.used&&Math.hypot(p.x-s.x,p.y-s.y)<40){ openBuild(s); return; } }
  closeSheets();
});

/* ---------- UI ---------- */
const $=id=>document.getElementById(id);
function showScreen(){ ["menu","levels","game","rank"].forEach(s=>$("scr-"+s).classList.toggle("hidden",SCREEN!==s)); }
function updateHUD(){ if(!G)return; $("lives").textContent=Math.max(0,G.lives); $("gold").textContent=G.gold; $("wave").textContent=G.wave+"/"+WAVES.length; }
function setStartBtn(){ const b=$("startBtn"); if(!G)return;
  if(G.running){ b.textContent="⚔ WAVE "+G.wave; b.classList.add("running"); }
  else if(G.wave>=WAVES.length){ b.textContent="✓ CLEAR"; }
  else { b.textContent="▶ WAVE "+(G.wave+1); b.classList.remove("running"); } }
function openBuild(spot){ closeSheets(); G.selSpot=spot; const list=$("towerList"); list.innerHTML="";
  for(const key of TKEYS){ const d=TOWERS[key],can=G.gold>=d.cost;
    const el=document.createElement("div"); el.className="tw"+(can?"":" cant");
    el.innerHTML=`<canvas class="tw-ico" width="56" height="56"></canvas><div class="tw-name">${d.name}</div><div class="tw-cost">🪙${d.cost}</div><div class="tw-desc">${d.desc}</div>`;
    el.onclick=()=>{ SND.play("button"); if(buildTower(spot,key)) closeSheets(); };
    list.appendChild(el); const c=el.querySelector("canvas").getContext("2d"); const im=IMG["tower_"+key]||IMG[d.img];
    if(im)c.drawImage(im,0,0,56,56); else{c.fillStyle=d.color;c.beginPath();c.arc(28,28,20,0,7);c.fill();} }
  $("buildSheet").classList.remove("hidden"); }
function openManage(t){ closeSheets(); G.selTower=t; SND.play("button");
  $("mgTitle").textContent=TOWERS[t.type].name+" · Lv "+t.lvl; const st=tstat(t);
  $("mgInfo").innerHTML=`DMG <b>${Math.round(st.dmg)}</b> · RNG <b>${Math.round(st.range)}</b> · spent <b>🪙${t.spent}</b>`;
  const uc=upCost(t),ub=$("upgradeBtn"); ub.classList.toggle("cant",G.gold<uc||t.lvl>=4);
  ub.textContent=t.lvl>=4?"MAX":"⬆ Upgrade 🪙"+uc;
  ub.onclick=()=>{ if(t.lvl<4&&G.gold>=uc){ G.gold-=uc;t.lvl++;t.spent+=uc; SND.play("upgrade"); updateHUD(); openManage(t);} };
  $("sellBtn").textContent="Sell 🪙"+Math.round(t.spent*0.6);
  $("sellBtn").onclick=()=>{ G.gold+=Math.round(t.spent*0.6); t.spot.used=false; G.towers=G.towers.filter(x=>x!==t); SND.play("coin"); updateHUD(); closeSheets(); };
  $("manageSheet").classList.remove("hidden"); }
function closeSheets(){ $("buildSheet").classList.add("hidden"); $("manageSheet").classList.add("hidden"); if(G){G.selSpot=null;G.selTower=null;} }

/* ---------- result / stars ---------- */
function starsFor(){ if(G.leaks===0)return 3; if(G.lives>=12)return 2; return 1; }
function endGame(win){ G.over=true; G.win=win; G.running=false;
  if(win){ const st=starsFor(); const prev=PROG.stars[LEVEL]||0; if(st>prev)PROG.stars[LEVEL]=st;
    if(LEVEL+1<MAPS.length && PROG.unlocked<LEVEL+2) PROG.unlocked=LEVEL+2; saveProg(PROG); SND.play("win"); setTimeout(()=>SND.play("star"),400); }
  else SND.play("lose");
  const t=$("ovTitle"),s=$("ovSub"),st=$("ovStars");
  t.className="ov-title "+(win?"win":"lose"); t.innerHTML=win?"VICTORY!":"DEFEATED";
  if(win){ const n=starsFor(); st.innerHTML=[0,1,2].map(i=>`<span class="${i<n?'on':''}">★</span>`).join(""); st.classList.remove("hidden"); }
  else st.classList.add("hidden");
  // final score: run points + progress bonuses
  const finalScore=Math.round((G.score||0) + G.wave*120 + LEVEL*400 + (win?starsFor()*500:0));
  G.finalScore=finalScore;
  s.innerHTML=(win?`${MAPS[LEVEL].theme.toUpperCase()} cleared!`:`The crystal fell on wave ${G.wave}.`)
    +`<br><span style="color:#ffce54;font-size:26px">SCORE ${finalScore.toLocaleString()}</span>`;
  $("ovNext").classList.toggle("hidden", !(win && LEVEL+1<MAPS.length));
  $("overlay").classList.remove("hidden");
  // submit to global leaderboard (nickname required; otherwise just stored locally)
  LB.submit(finalScore, LEVEL).then(res=>{
    if(res && res.rank){ const line=document.createElement("div"); line.style.cssText="color:#8fe36a;font-weight:800;font-size:18px;margin-top:8px";
      line.textContent=res.best>finalScore?`Best ${res.best.toLocaleString()} · World #${res.rank}`:`🏆 New best! World #${res.rank}`;
      s.appendChild(line); }
    else if(res && res.offline && !LB.nick()){ const line=document.createElement("div"); line.style.cssText="color:#9fb08f;font-size:15px;margin-top:8px";
      line.textContent="Set a name on the menu to join the world ranking."; s.appendChild(line); }
  });
}
/* ---------- level select ---------- */
function buildLevelSelect(){ const grid=$("lvlGrid"); grid.innerHTML="";
  MAPS.forEach((m,i)=>{ const unlocked=(i+1)<=PROG.unlocked; const st=PROG.stars[i]||0;
    const el=document.createElement("div"); el.className="lvl"+(unlocked?"":" locked");
    el.style.background=THEMES[m.theme].g2;
    el.innerHTML=`<div class="lvl-n">${i+1}</div><div class="lvl-name">${THEMES[m.theme].name}</div>
      <div class="lvl-stars">${unlocked?[0,1,2].map(k=>`<span class="${k<st?'on':''}">★</span>`).join(""):"🔒"}</div>`;
    if(unlocked) el.onclick=()=>{ SND.play("button"); SND.startMusic(); newGame(i); };
    grid.appendChild(el); });
}

/* ---------- buttons / nav ---------- */
$("startBtn").onclick=()=>{ closeSheets(); startWave(); };
$("speedBtn").onclick=()=>{ G.speed=G.speed===1?2:1; $("speedBtn").textContent=G.speed+"×"; SND.play("button"); };
$("pauseBtn").onclick=()=>{ SND.play("button"); SCREEN="levels"; buildLevelSelect(); showScreen(); };
$("playBtn").onclick=()=>{ SND.resume(); SND.startMusic(); SND.play("button"); SCREEN="levels"; buildLevelSelect(); showScreen(); };
$("lvlBack").onclick=()=>{ SND.play("button"); SCREEN="menu"; showScreen(); };
$("ovBtn").onclick=()=>{ SND.play("button"); $("overlay").classList.add("hidden"); newGame(LEVEL); };
$("ovNext").onclick=()=>{ SND.play("button"); $("overlay").classList.add("hidden"); newGame(Math.min(LEVEL+1,MAPS.length-1)); };
$("ovMenu").onclick=()=>{ SND.play("button"); $("overlay").classList.add("hidden"); SCREEN="levels"; buildLevelSelect(); showScreen(); };
$("muteBtn").onclick=()=>{ const m=SND.toggleMute(); $("muteBtn").textContent=m?"🔇":"🔊"; if(!m)SND.startMusic(); };
$("muteBtn2").onclick=()=>{ const m=SND.toggleMute(); const t=m?"🔇":"🔊"; $("muteBtn").textContent=t; $("muteBtn2").textContent=t; };
$("muteBtn").textContent=SND.isMuted()?"🔇":"🔊"; $("muteBtn2").textContent=SND.isMuted()?"🔇":"🔊";

/* ---------- leaderboard UI ---------- */
function refreshNick(){ const n=LB.nick(); $("menuNick").textContent=n||"— tap to set —"; }
function openNick(){ SND.play("button"); $("nickInput").value=LB.nick(); $("nickModal").classList.remove("hidden"); setTimeout(()=>$("nickInput").focus(),50); }
function closeNick(){ $("nickModal").classList.add("hidden"); }
$("menuNick").onclick=openNick;
$("nickSave").onclick=()=>{ const n=LB.setNick($("nickInput").value); SND.play(n?"upgrade":"button"); refreshNick(); closeNick();
  if(n && LB.localBest()>0) LB.submit(LB.localBest(), 0); };
$("nickInput").addEventListener("keydown",e=>{ if(e.key==="Enter") $("nickSave").click(); });

async function loadRank(){ const st=$("rankStatus"),list=$("rankList"); st.textContent="Loading…"; list.innerHTML="";
  try{ const rows=await LB.top(50); const me=LB.nick();
    if(!rows.length){ st.textContent="No scores yet — be the first!"; return; }
    st.textContent=me?`You are “${me}”. Beat your best to climb.`:"Set a name on the menu to appear here.";
    list.innerHTML=rows.map(r=>{ const mine=me&&r.name===me;
      return `<div class="rank-row${mine?' me':''} top${r.rank}"><div class="rank-pos">${r.rank<=3?['🥇','🥈','🥉'][r.rank-1]:'#'+r.rank}</div>`
        +`<div class="rank-name">${r.name.replace(/</g,'&lt;')}</div><div class="rank-score">${r.score.toLocaleString()}</div></div>`; }).join("");
  }catch(e){ st.textContent="Couldn't reach the ranking server. Check your connection."; }
}
function openRank(){ SND.play("button"); SCREEN="rank"; showScreen(); loadRank(); }
$("rankBtn").onclick=openRank;
$("rankBack").onclick=()=>{ SND.play("button"); SCREEN="menu"; showScreen(); };
$("rankRefresh").onclick=()=>{ SND.play("button"); loadRank(); };

refreshNick();
showScreen();
