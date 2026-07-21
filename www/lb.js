"use strict";
/* Kingdom Guard — global leaderboard client.
   Nickname only, no login: set a name and your best score shows on the world board.
   Backend: tiny FastAPI on Railway (server/main.py). */
const LB = (() => {
  const API = "https://kingdom-guard-lb-production.up.railway.app";
  const NICK_KEY = "kg.nick";

  function nick(){ return localStorage.getItem(NICK_KEY) || ""; }
  function setNick(n){
    n = (n || "").replace(/[^0-9A-Za-z가-힣 _.\-]/g, "").trim().slice(0, 12);
    if (n) localStorage.setItem(NICK_KEY, n);
    return n;
  }
  function bestKey(){ return "kg.best"; }
  function localBest(){ return parseInt(localStorage.getItem(bestKey()) || "0", 10) || 0; }

  async function submit(score, level){
    const name = nick();
    const best = Math.max(localBest(), score);
    localStorage.setItem(bestKey(), String(best));
    if (!name) return { offline:true };
    try{
      const r = await fetch(API + "/score", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ name, score, level: level|0 }),
      });
      if (!r.ok) throw 0;
      return await r.json();
    }catch(e){ return { offline:true }; }
  }
  async function top(limit){
    const r = await fetch(API + "/top" + (limit?("?limit="+limit):""), { cache:"no-store" });
    if (!r.ok) throw new Error("net");
    return await r.json();
  }
  return { API, nick, setNick, localBest, submit, top };
})();
