# -*- coding: utf-8 -*-
"""개발서버(신규) vs 운영개발 미러(기존) 사용자 게시판 목록 대조 — 읽기 전용, 순차, 소량.
사용: python3 tests/compare/compare_boards.py
"""
import html, http.cookiejar, re, ssl, sys, time, urllib.request
M = "https://dialect.inseq.co.kr:9443"; D = "https://dev.neibis.inseq.co.kr:8443"
ctx = ssl.create_default_context(); ctx.check_hostname = False; ctx.verify_mode = ssl.CERT_NONE
def op(): return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()), urllib.request.HTTPSHandler(context=ctx))
def get(o, u):
    time.sleep(0.8)
    return o.open(u, timeout=30).read().decode("utf-8", "replace")
def txt(s): return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", s, flags=re.S)))).strip()
def rows_dev(s):
    out = []
    for r in re.findall(r"<tr[^>]*>(.*?)</tr>", s, re.S):
        t = txt(r)
        m = re.match(r"^(\d+|공지)\s+(.*?)\s+(?:\S+\s+\S+\s+\d+\s+\d+:\d+:\d+\s+KST\s+\d{4})\s+(\d+)$", t)
        d = re.search(r"(\w{3}) (\w{3}) (\d+) [\d:]+ KST (\d{4})", t)
        if m and d:
            mon = "JanFebMarAprMayJunJulAugSepOctNovDec".index(d.group(2)) // 3 + 1
            out.append((m.group(1), re.sub(r"\s*첨부.*$", "", m.group(2)).strip(), "%s-%02d-%02d" % (d.group(4), mon, int(d.group(3)))))
    return out
def rows_m(s):
    t = txt(s); out = []
    for m in re.finditer(r"(?:(?<=\s)|^)(\d+|공지)?\s?(.+?)\s(\d{4}-\d{2}-\d{2})\s(\d+)(?=\s|$)", t[t.find("조회수"):] if "조회수" in t else t):
        out.append((m.group(1) or "", m.group(2).strip(), m.group(3)))
    return out
def titles(rows): return sorted(r[1] for r in rows)
if __name__ == "__main__":
    om, od = op(), op(); get(od, D + "/dialect/ko/index.do")
    for name, mu, du in [("공지사항", "/dialect/board/notice/list?pageSize=50", "/dialect/ko/bbs/101/list.do?pageItm=50"),
                         ("자료실", "/dialect/board/disk/list?pageSize=50", "/dialect/ko/bbs/99/list.do?pageItm=50")]:
        a = rows_m(get(om, M + mu)); b = rows_dev(get(od, D + du))
        ta, tb = set(r[1] for r in a), set(r[1] for r in b)
        print("== %s: 미러 %d건 / 개발 %d건" % (name, len(a), len(b)))
        print("  개발에만:", sorted(tb - ta)); print("  미러에만:", sorted(ta - tb))
