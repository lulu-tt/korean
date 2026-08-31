from http.server import BaseHTTPRequestHandler
import json
import urllib.request
import urllib.parse
import re
import ssl

TURSO_URL = "https://korean-weather-lulu-tt.aws-ap-northeast-1.turso.io/v2/pipeline"
TURSO_TOKEN = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODgxNDA2MDUsImlkIjoiMDFhMDU1N2MtMzUwMS03ZWI1LTlkNTctZjI0NzJmZjQzOTRkIiwia2lkIjoiNm1PSEd1b2NjdG4tN2I5SHBDOTZnQW5XNVZuN29PZU10cnBHZWVUdEo3NCIsInJpZCI6Ijc0YzdjODIzLWI1MDQtNDRlMS1hZDNhLWUxZmIzODdiNWE2MSJ9.T_f31BvhLdd4CV8pb_UNmsP5YKo0jvKmYuMN6u1rE_oTmEcVzNWp1xt0BhLKZF9gj1rL0UaqVg9JXGbDEfABBw"

REGION_ORDER = ['GG', 'GW', 'CB', 'CN', 'JB', 'JN', 'GB', 'GN', 'JJ']
REGION_NAMES = {'GG': '경기', 'GW': '강원', 'CB': '충북', 'CN': '충남', 'JB': '전북', 'JN': '전남', 'GB': '경북', 'GN': '경남', 'JJ': '제주'}
SITE_NAMES = {'GG': '경기 파주', 'GW': '강원 강릉', 'CB': '충북 청주', 'CN': '충남 부여', 'JB': '전북 전주', 'JN': '전남 나주', 'GB': '경북 안동', 'GN': '경남 창원', 'JJ': '제주 서귀포'}

def turso_query(sql, args=None):
    stmt = {'sql': sql}
    if args:
        stmt['args'] = [{'type': 'text', 'value': str(a)} for a in args]
    payload = json.dumps({'requests': [{'type': 'execute', 'stmt': stmt}]}).encode('utf-8')
    req = urllib.request.Request(TURSO_URL, data=payload, headers={
        'Authorization': f'Bearer {TURSO_TOKEN}',
        'Content-Type': 'application/json'
    })
    ctx = ssl.create_default_context()
    with urllib.request.urlopen(req, context=ctx) as resp:
        res = json.loads(resp.read().decode('utf-8'))
        exec_res = res['results'][0]['response']['result']
        cols = [c['name'] for c in exec_res['cols']]
        rows = []
        for r in exec_res['rows']:
            row_dict = {}
            for idx, col_name in enumerate(cols):
                val_obj = r[idx]
                row_dict[col_name] = val_obj.get('value') if isinstance(val_obj, dict) else val_obj
            rows.append(row_dict)
        return rows

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        
        if parsed.path.endswith('/api/weather/awareness') or parsed.path.endswith('/neibis-api/weather/awareness'):
            try:
                # Fetch summary data from Turso
                file_rows = turso_query("SELECT weather_file_id, region_cd, gen_cd, sex_cd, row_cnt, reg_dt FROM wb_weather_file")
                resp_rows = turso_query("SELECT weather_response_id, weather_file_id, region_cd, item_cd, standard_word, dialect_word, usage_grade FROM wb_weather_response")

                # Build response structure
                items_dict = {}
                for r in resp_rows:
                    code = r.get('item_cd')
                    word = r.get('standard_word')
                    if not code or not word: continue
                    if code not in items_dict:
                        items_dict[code] = {'code': code, 'word': word, 'regions': {}}
                    rg = r.get('region_cd')
                    if rg and rg in REGION_ORDER:
                        if rg not in items_dict[code]['regions']:
                            items_dict[code]['regions'][rg] = {'rows': 0, 'graded': 0, 'people': 0, 'state': 'w1'}
                        items_dict[code]['regions'][rg]['rows'] += 1
                        if r.get('usage_grade'):
                            items_dict[code]['regions'][rg]['graded'] += 1

                data = {
                    "status": "success",
                    "source": "turso_cloud",
                    "regionOrder": REGION_ORDER,
                    "regionNames": REGION_NAMES,
                    "regionSites": SITE_NAMES,
                    "meta": {
                        "years": [{"degree": "24", "year": "2024", "files": len(file_rows)}],
                        "qc": {"files": len(file_rows), "rowsTotal": len(resp_rows), "coreItems": len(items_dict)}
                    },
                    "items": list(items_dict.values())
                }
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps(data, ensure_ascii=False).encode('utf-8'))
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "error", "message": str(e)}).encode('utf-8'))
            return
        
        self.send_response(404)
        self.end_headers()
