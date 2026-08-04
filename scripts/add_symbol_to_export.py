#!/usr/bin/env python3
# 지도 export JSON의 각 변이형(variant)에 원본 심볼 파일명(symbolFile)을 추가한다.
# 파일명 = {HEX(symbol_color)}_{tb_map_symbol.file_nm stem}.png  (폴더 symbol/)
# 폴더에 없는 조합은 tb_map_symbol.icon(마스터)을 틴트해 생성.
import sqlite3, os, re, colorsys, json, base64, io, sys, glob
from PIL import Image
DB="dialect_local.db"; SYMDIR="symbol"
con=sqlite3.connect(DB); con.row_factory=sqlite3.Row
SYM={r['map_symbol_id']:(os.path.splitext(r['file_nm'] or '')[0], r['icon']) for r in con.execute("SELECT map_symbol_id,file_nm,icon FROM tb_map_symbol")}
def norm(s):
    if not s: return None
    s=s.strip()
    if re.match(r'^#?[0-9A-Fa-f]{6}$',s): return s.lstrip('#').upper()
    m=re.match(r'RGB\((\d+),\s*(\d+),\s*(\d+)\)',s,re.I)
    if m: return '{:02X}{:02X}{:02X}'.format(*map(int,m.groups()))
    m=re.match(r'HSV\((\d+),\s*(\d+)%?,\s*(\d+)%?\)',s,re.I)
    if m:
        h,sv,v=map(int,m.groups()); R,G,B=colorsys.hsv_to_rgb(h/360,sv/100,v/100)
        return '{:02X}{:02X}{:02X}'.format(int(R*255),int(G*255),int(B*255))
    return None
def tint(icon_b64,hexc):
    im=Image.open(io.BytesIO(base64.b64decode(icon_b64))).convert("RGBA")
    r=int(hexc[0:2],16);g=int(hexc[2:4],16);b=int(hexc[4:6],16); px=im.load()
    for y in range(im.height):
        for x in range(im.width):
            a=px[x,y][3]; px[x,y]=(r,g,b,a)
    return im
def resolve(color_raw, mid):
    c=norm(color_raw); rec=SYM.get(mid)
    if not c or not rec or not rec[0]: return None
    stem,icon=rec; fname=f"{c}_{stem}.png"; fp=os.path.join(SYMDIR,fname)
    if not os.path.exists(fp) and icon:
        try: tint(icon,c).save(fp)
        except Exception: return None
    return fname if os.path.exists(fp) else None

def augment(path):
    d=json.load(open(path,encoding="utf-8"))
    hw=str(d.get("headword_no"))
    # (mutation_group, word) -> (symbol_color, map_symbol_id)
    lut={}
    for r in con.execute("SELECT mutation_group mg, word, symbol_color sc, map_symbol_id mid FROM tb_headword_dialect WHERE headword_no=?",(hw,)):
        lut.setdefault((str(r['mg']), r['word']), (r['sc'], r['mid']))
    tot=hit=0
    for gk,g in (d.get("groups") or {}).items():
        mg=str(g.get("mutation_group"))
        for v in g.get("variants",[]):
            tot+=1
            key=(mg, v.get("word"))
            sc_mid=lut.get(key)
            f=resolve(*sc_mid) if sc_mid else None
            if f: hit+=1
            v["symbolFile"]=f  # 없으면 null → 코어가 벡터 폴백
    json.dump(d, open(path,"w",encoding="utf-8"), ensure_ascii=False)
    return tot,hit

if __name__=="__main__":
    files = sys.argv[1:] or sorted(glob.glob("data/processed/map/*.json"))
    T=H=0
    for p in files:
        t,h=augment(p); T+=t; H+=h
        if len(files)<=3: print(os.path.basename(p), f"variants={t} symbol_hit={h}")
    print(f"[done] files={len(files)} variants={T} symbolFile채움={H} ({100*H/max(T,1):.1f}%)")
