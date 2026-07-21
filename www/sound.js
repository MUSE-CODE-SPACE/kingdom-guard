"use strict";
/* Procedural sound — Web Audio only, no asset files (copyright-free, tiny).
   Synthesizes every SFX + a simple looping music bed. Respects a mute flag. */
const SND = (() => {
  let ctx = null, master = null, musicGain = null, sfxGain = null;
  let muted = localStorage.getItem("kg.muted") === "1";
  let musicOn = false, musicTimer = null;

  function ensure() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
    musicGain = ctx.createGain(); musicGain.gain.value = 0.18; musicGain.connect(master);
    sfxGain = ctx.createGain(); sfxGain.gain.value = 0.75; sfxGain.connect(master);
  }
  function resume(){ ensure(); if (ctx.state === "suspended") ctx.resume(); }

  function tone(freq, dur, type, vol, dest, slideTo) {
    if (muted) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || "sine"; o.frequency.value = freq;
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1,slideTo), ctx.currentTime + dur);
    g.gain.value = 0.0001;
    g.gain.exponentialRampToValueAtTime(vol || 0.3, ctx.currentTime + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.connect(g); g.connect(dest || sfxGain); o.start(); o.stop(ctx.currentTime + dur + 0.02);
  }
  function noise(dur, vol, filterFreq) {
    if (muted) return;
    const n = ctx.createBufferSource();
    const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i=0;i<d.length;i++) d[i] = (Math.random()*2-1) * (1 - i/d.length);
    n.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type="lowpass"; f.frequency.value = filterFreq||1200;
    const g = ctx.createGain(); g.gain.value = vol||0.3;
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    n.connect(f); f.connect(g); g.connect(sfxGain); n.start(); n.stop(ctx.currentTime + dur);
  }

  const SFX = {
    shoot(){ tone(520, 0.09, "square", 0.16, sfxGain, 300); },
    shootArcher(){ tone(880, 0.05, "triangle", 0.12, sfxGain, 620); },
    shootFrost(){ tone(700, 0.14, "sine", 0.14, sfxGain, 1200); },
    boom(power){ const p=Math.max(0.5,Math.min(2.2,power||1));
      noise(0.22+0.08*p, 0.42*p, 1100/p); tone(150/p, 0.22+0.08*p, "sawtooth", 0.22*p, sfxGain, 40/p);
      tone(90/p, 0.3*p, "sine", 0.3*p, sfxGain, 30); },
    hit(){ tone(300, 0.05, "square", 0.08); },
    die(combo){ const up=1+Math.min(1.6,(combo||0)*0.05); tone(360*up, 0.15, "sawtooth", 0.2, sfxGain, 90*up); noise(0.13,0.2,700);
      if(combo>=5) tone(880*up,0.08,"triangle",0.12,sfxGain); },
    coin(){ tone(1180, 0.07, "square", 0.14, sfxGain); setTimeout(()=>tone(1560,0.09,"square",0.13),40); },
    build(){ tone(300, 0.08, "square", 0.2, sfxGain, 500); setTimeout(()=>tone(600,0.1,"square",0.18),70); },
    upgrade(){ tone(500,0.08,"square",0.2,sfxGain,800); setTimeout(()=>tone(760,0.08,"square",0.2),80); setTimeout(()=>tone(1020,0.12,"square",0.2),160); },
    wave(){ tone(180,0.16,"sawtooth",0.25,sfxGain,260); setTimeout(()=>tone(240,0.2,"sawtooth",0.22),120); },
    button(){ tone(640,0.05,"triangle",0.14); },
    leak(){ tone(200,0.22,"sawtooth",0.28,sfxGain,80); },
    win(){ [523,659,784,1047].forEach((f,i)=>setTimeout(()=>tone(f,0.22,"triangle",0.26),i*130)); },
    lose(){ [440,392,330,262].forEach((f,i)=>setTimeout(()=>tone(f,0.3,"sawtooth",0.24),i*160)); },
    star(){ tone(880,0.1,"triangle",0.22,sfxGain); setTimeout(()=>tone(1320,0.16,"triangle",0.22),90); },
  };
  function play(name, ...a){ if (muted) return; resume(); (SFX[name]||(()=>{}))(...a); }

  // simple arpeggio music bed
  const SCALE = [220,261.63,293.66,329.63,392,440,523.25];
  const PROG = [0,2,4,3, 0,4,5,2];
  let step = 0;
  function musicTick(){
    if (muted || !musicOn) return;
    const base = SCALE[PROG[step % PROG.length]];
    tone(base, 0.5, "triangle", 0.5, musicGain);
    tone(base*2, 0.32, "sine", 0.28, musicGain);
    if (step % 2 === 0) tone(base/2, 0.6, "sine", 0.4, musicGain);
    step++;
    musicTimer = setTimeout(musicTick, 340);
  }
  function startMusic(){ resume(); if (musicOn) return; musicOn = true; step = 0; musicTick(); }
  function stopMusic(){ musicOn = false; if (musicTimer) clearTimeout(musicTimer); }

  return {
    play, resume, startMusic, stopMusic,
    isMuted(){ return muted; },
    toggleMute(){ muted = !muted; localStorage.setItem("kg.muted", muted?"1":"0");
      if (muted) stopMusic(); return muted; },
  };
})();
