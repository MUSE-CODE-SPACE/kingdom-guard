import urllib.request, json, base64, os, sys
KEY=open(os.path.expanduser("~/Projects/MuseBot/.env")).read()
KEY=[l for l in KEY.splitlines() if l.startswith("OPENAI_API_KEY=")][0].split("=",1)[1].strip().strip('"')
STYLE=" cute cartoon mobile game sprite, thick bold black outline, soft cel shading, vibrant saturated colors, single object centered, plain transparent background, no shadow on ground, no text"
JOBS={
 "tower_cannon":"top-down slightly angled view of a cannon turret tower: round stone base with a dark iron cannon barrel,"+STYLE,
 "tower_archer":"top-down slightly angled view of an archer ballista tower: wooden crossbow on a green stone base,"+STYLE,
 "tower_frost":"top-down slightly angled view of a frost magic tower: a glowing light-blue ice crystal orb on a snowy stone base with icy shards,"+STYLE,
 "enemy_slime":"a cute round green slime blob monster with big friendly eyes,"+STYLE,
 "enemy_runner":"a small fast yellow-orange goblin scout monster mid-run, lean and quick,"+STYLE,
 "enemy_tank":"a chunky heavily armored purple beetle monster with a thick rocky shell,"+STYLE,
 "enemy_boss":"a giant menacing dark-red demon boss monster with big horns and glowing eyes,"+STYLE,
 "crystal":"a glowing blue faceted magic crystal gem, radiant,"+STYLE,
}
def gen(name,prompt):
    body=json.dumps({"model":"gpt-image-1","prompt":prompt,"size":"1024x1024","quality":"medium","background":"transparent","n":1}).encode()
    req=urllib.request.Request("https://api.openai.com/v1/images/generations",data=body,
        headers={"Authorization":"Bearer "+KEY,"Content-Type":"application/json"})
    d=json.load(urllib.request.urlopen(req,timeout=180))
    b=d["data"][0]["b64_json"]
    open(f"raw-art/{name}.png","wb").write(base64.b64decode(b))
    print(name,"OK")
only=sys.argv[1:] if len(sys.argv)>1 else list(JOBS)
for n in only:
    try: gen(n,JOBS[n])
    except Exception as e: print(n,"ERR",str(e)[:120])
