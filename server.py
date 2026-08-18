import http.server
import socketserver
import sqlite3
import json
import os
import urllib.parse

PORT = 8765
DIRECTORY = "/Users/aaa/inseq/korean"
DB_PATH = "/Users/aaa/inseq/korean/dialect_local.db"

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        # 개발 서버: Cache-Control이 없으면 브라우저가 휴리스틱 캐싱으로 옛 JSON을
        # 재검증 없이 재사용한다(export를 다시 만들어도 화면에 반영되지 않음).
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        super().end_headers()

    def do_GET(self):
        parsed_url = urllib.parse.urlparse(self.path)
        query_params = urllib.parse.parse_qs(parsed_url.query)

        # Notice List API
        if parsed_url.path == '/api/notices':
            self.send_response(200)
            self.send_header('Content-type', 'application/json; charset=utf-8')
            self.end_headers()
            
            try:
                conn = sqlite3.connect(DB_PATH)
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()
                
                cursor.execute("""
                    SELECT post_id, board_id, post_title, view_count, fix_yn, create_dt
                    FROM tb_board_post 
                    WHERE board_id = 'notice' AND use_yn = 'Y'
                    ORDER BY fix_yn DESC, CAST(create_dt AS INTEGER) DESC
                """)
                rows = cursor.fetchall()
                
                notices = []
                for row in rows:
                    notices.append({
                        "post_id": row["post_id"],
                        "title": row["post_title"],
                        "view_count": row["view_count"],
                        "fix_yn": row["fix_yn"],
                        "create_dt": row["create_dt"]
                    })
                
                conn.close()
                self.wfile.write(json.dumps({"status": "success", "data": notices}, ensure_ascii=False).encode('utf-8'))
            except Exception as e:
                self.wfile.write(json.dumps({"status": "error", "message": str(e)}).encode('utf-8'))
            return

        # Notice Detail API
        elif parsed_url.path == '/api/notice_detail':
            self.send_response(200)
            self.send_header('Content-type', 'application/json; charset=utf-8')
            self.end_headers()
            
            post_id = query_params.get('id', [None])[0]
            
            try:
                conn = sqlite3.connect(DB_PATH)
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()
                
                if not post_id:
                    cursor.execute("""
                        SELECT post_id, board_id, post_title, post_content, view_count, fix_yn, create_dt
                        FROM tb_board_post 
                        WHERE board_id = 'notice' AND use_yn = 'Y'
                        ORDER BY CAST(create_dt AS INTEGER) DESC LIMIT 1
                    """)
                else:
                    cursor.execute("""
                        SELECT post_id, board_id, post_title, post_content, view_count, fix_yn, create_dt
                        FROM tb_board_post 
                        WHERE post_id = ? AND board_id = 'notice'
                    """, (post_id,))
                
                row = cursor.fetchone()
                if row:
                    new_views = int(row["view_count"] or 0) + 1
                    cursor.execute("UPDATE tb_board_post SET view_count = ? WHERE post_id = ?", (str(new_views), row["post_id"]))
                    conn.commit()
                    
                    cursor.execute("""
                        SELECT post_id, post_title FROM tb_board_post
                        WHERE board_id = 'notice' AND use_yn = 'Y' AND CAST(create_dt AS INTEGER) < CAST(? AS INTEGER)
                        ORDER BY CAST(create_dt AS INTEGER) DESC LIMIT 1
                    """, (row["create_dt"],))
                    prev_row = cursor.fetchone()
                    
                    cursor.execute("""
                        SELECT post_id, post_title FROM tb_board_post
                        WHERE board_id = 'notice' AND use_yn = 'Y' AND CAST(create_dt AS INTEGER) > CAST(? AS INTEGER)
                        ORDER BY CAST(create_dt AS INTEGER) ASC LIMIT 1
                    """, (row["create_dt"],))
                    next_row = cursor.fetchone()
                    
                    detail = {
                        "post_id": row["post_id"],
                        "title": row["post_title"],
                        "content": row["post_content"],
                        "view_count": new_views,
                        "fix_yn": row["fix_yn"],
                        "create_dt": row["create_dt"],
                        "prev_post": {"post_id": prev_row["post_id"], "title": prev_row["post_title"]} if prev_row else None,
                        "next_post": {"post_id": next_row["post_id"], "title": next_row["post_title"]} if next_row else None
                    }
                    self.wfile.write(json.dumps({"status": "success", "data": detail}, ensure_ascii=False).encode('utf-8'))
                else:
                    self.wfile.write(json.dumps({"status": "error", "message": "Post not found"}).encode('utf-8'))
                conn.close()
            except Exception as e:
                self.wfile.write(json.dumps({"status": "error", "message": str(e)}).encode('utf-8'))
            return

        # Literature Dialect List API (dialect_local.db · tb_literature + tb_literature_example)
        elif parsed_url.path == '/api/literatures':
            self.send_response(200)
            self.send_header('Content-type', 'application/json; charset=utf-8')
            self.end_headers()

            q = query_params.get('q', [''])[0].strip()
            region = query_params.get('region', [''])[0].strip()
            writer = query_params.get('writer', [''])[0].strip()
            book = query_params.get('book', [''])[0].strip()
            target = query_params.get('target', ['all'])[0].strip().lower()  # all | dialect | standard
            match_mode = query_params.get('match', ['contains'])[0].strip().lower()  # contains | exact | prefix | suffix
            try:
                page = max(1, int(query_params.get('page', [1])[0]))
            except (TypeError, ValueError):
                page = 1
            try:
                limit = min(100, max(1, int(query_params.get('limit', [12])[0])))
            except (TypeError, ValueError):
                limit = 12
            offset = (page - 1) * limit

            def like_pattern(term, mode):
                if mode in ('exact', 'eq', '일치'):
                    return term
                if mode in ('prefix', 'start', '시작문자'):
                    return f"{term}%"
                if mode in ('suffix', 'end', '끝문자'):
                    return f"%{term}"
                return f"%{term}%"

            def op_sql(col, mode):
                if mode in ('exact', 'eq', '일치'):
                    return f"{col} = ?"
                return f"{col} LIKE ?"

            try:
                conn = sqlite3.connect(DB_PATH)
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()

                # 공개 노출 기본: use_yn = 'Y' (없으면 포함)
                where_clauses = ["(l.use_yn IS NULL OR l.use_yn = '' OR UPPER(l.use_yn) = 'Y')"]
                params = []

                if q:
                    pat = like_pattern(q, match_mode)
                    if target in ('dialect', 'dlt', '지역어'):
                        where_clauses.append(op_sql('l.dlt_tp', match_mode))
                        params.append(pat if match_mode not in ('exact', 'eq', '일치') else q)
                    elif target in ('standard', 'std', '표준어'):
                        where_clauses.append(op_sql('l.std_tp', match_mode))
                        params.append(pat if match_mode not in ('exact', 'eq', '일치') else q)
                    else:
                        # 전체: 표제어·표준어·뜻·관련방언·지역·용례·작가·작품
                        where_clauses.append(
                            "("
                            + " OR ".join([
                                op_sql('l.dlt_tp', match_mode),
                                op_sql('l.std_tp', match_mode),
                                op_sql('l.mean', match_mode),
                                op_sql('l.rel_dlt', match_mode),
                                op_sql('l.region_nm', match_mode),
                                op_sql('e.word_example', match_mode),
                                op_sql('e.writer', match_mode),
                                op_sql('e.book_name', match_mode),
                            ])
                            + ")"
                        )
                        pval = pat if match_mode not in ('exact', 'eq', '일치') else q
                        params.extend([pval] * 8)

                # 다중 지역: comma-separated → OR (예: 강원도,경상도)
                regions = [r.strip() for r in region.replace('|', ',').split(',') if r.strip() and r.strip() != '전체']
                if regions:
                    region_ors = []
                    for r in regions:
                        region_ors.append("l.region_nm LIKE ?")
                        params.append(f"%{r}%")
                    where_clauses.append("(" + " OR ".join(region_ors) + ")")

                if writer and writer not in ('전체', '(전체)', 'all'):
                    where_clauses.append("TRIM(e.writer) = ?")
                    params.append(writer)

                if book and book not in ('전체', '(전체)', 'all'):
                    where_clauses.append("TRIM(e.book_name) = ?")
                    params.append(book)

                where_sql = " WHERE " + " AND ".join(where_clauses)

                cursor.execute(f"""
                    SELECT COUNT(DISTINCT l.liter_id) AS total
                    FROM tb_literature l
                    LEFT JOIN tb_literature_example e
                      ON l.liter_id = e.liter_id
                     AND (e.use_yn IS NULL OR e.use_yn = '' OR UPPER(e.use_yn) = 'Y')
                    {where_sql}
                """, params)
                total_count = cursor.fetchone()["total"]

                cursor.execute(f"""
                    SELECT l.liter_id, l.dlt_tp, l.std_tp, l.word_class, l.mean,
                           l.region_nm, l.rel_dlt, l.word_desc,
                           l.exh_book_nm, l.exh_author, l.exh_publish_com, l.exh_publish_year
                    FROM tb_literature l
                    LEFT JOIN tb_literature_example e
                      ON l.liter_id = e.liter_id
                     AND (e.use_yn IS NULL OR e.use_yn = '' OR UPPER(e.use_yn) = 'Y')
                    {where_sql}
                    GROUP BY l.liter_id
                    ORDER BY CAST(l.liter_id AS INTEGER) ASC
                    LIMIT ? OFFSET ?
                """, params + [limit, offset])

                lit_rows = cursor.fetchall()
                result = []

                for row in lit_rows:
                    liter_id = row["liter_id"]
                    ex_params = [liter_id]
                    ex_sql = """
                        SELECT word_example, std_example, writer, book_name,
                               publish_company, publish_year, page_no
                        FROM tb_literature_example
                        WHERE liter_id = ?
                          AND (use_yn IS NULL OR use_yn = '' OR UPPER(use_yn) = 'Y')
                    """
                    # 작가/작품 필터 시 용례도 동일 조건으로 좁힘
                    if writer and writer not in ('전체', '(전체)', 'all'):
                        ex_sql += " AND TRIM(writer) = ?"
                        ex_params.append(writer)
                    if book and book not in ('전체', '(전체)', 'all'):
                        ex_sql += " AND TRIM(book_name) = ?"
                        ex_params.append(book)
                    ex_sql += " ORDER BY CAST(liter_exam_id AS INTEGER) ASC"
                    cursor.execute(ex_sql, ex_params)
                    examples = []
                    for ex in cursor.fetchall():
                        examples.append({
                            "example": ex["word_example"] or "",
                            "std_example": ex["std_example"] or "",
                            "writer": ex["writer"] or "",
                            "book_name": ex["book_name"] or "",
                            "publish_year": ex["publish_year"] or "",
                            "page_no": ex["page_no"] or "",
                        })

                    # 해설 출처: 〈책명, 저자, 출판사, 연도〉
                    src_parts = [
                        (row["exh_book_nm"] or "").strip(),
                        (row["exh_author"] or "").strip(),
                        (row["exh_publish_com"] or "").strip(),
                        (row["exh_publish_year"] or "").strip(),
                    ]
                    src_parts = [p for p in src_parts if p]
                    mean_src = "〈" + ", ".join(src_parts) + "〉" if src_parts else ""

                    result.append({
                        "liter_id": row["liter_id"],
                        "dlt_tp": row["dlt_tp"] or "",
                        "std_tp": row["std_tp"] or "",
                        "word_class": row["word_class"] or "",
                        "mean": row["mean"] or "",
                        "mean_src": mean_src,
                        "region_nm": row["region_nm"] or "",
                        "rel_dlt": row["rel_dlt"] or "",
                        "word_desc": row["word_desc"] or "",
                        "exh_book_nm": (row["exh_book_nm"] or "").strip(),
                        "exh_author": (row["exh_author"] or "").strip(),
                        "exh_publish_com": (row["exh_publish_com"] or "").strip(),
                        "exh_publish_year": (row["exh_publish_year"] or "").strip(),
                        "examples": examples,
                    })

                conn.close()
                self.wfile.write(json.dumps({
                    "status": "success",
                    "total": total_count,
                    "page": page,
                    "limit": limit,
                    "data": result,
                }, ensure_ascii=False).encode('utf-8'))
            except Exception as e:
                self.wfile.write(json.dumps({"status": "error", "message": str(e)}).encode('utf-8'))
            return

        # Literature facets: distinct writers / books from local DB
        elif parsed_url.path == '/api/literature_facets':
            self.send_response(200)
            self.send_header('Content-type', 'application/json; charset=utf-8')
            self.end_headers()

            writer = query_params.get('writer', [''])[0].strip()

            def hangul_cho(s):
                if not s:
                    return ''
                ch = s.strip()[0]
                if '가' <= ch <= '힣':
                    cho = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ',
                           'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ']
                    return cho[(ord(ch) - 0xAC00) // 588]
                return ch

            try:
                conn = sqlite3.connect(DB_PATH)
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()

                cursor.execute("""
                    SELECT TRIM(writer) AS name, COUNT(*) AS cnt
                    FROM tb_literature_example
                    WHERE writer IS NOT NULL AND TRIM(writer) != ''
                      AND (use_yn IS NULL OR use_yn = '' OR UPPER(use_yn) = 'Y')
                    GROUP BY TRIM(writer)
                    ORDER BY name COLLATE NOCASE ASC
                """)
                authors = []
                for r in cursor.fetchall():
                    authors.append({
                        "name": r["name"],
                        "count": r["cnt"],
                        "cho": hangul_cho(r["name"]),
                    })

                book_sql = """
                    SELECT TRIM(book_name) AS name, COUNT(*) AS cnt
                    FROM tb_literature_example
                    WHERE book_name IS NOT NULL AND TRIM(book_name) != ''
                      AND (use_yn IS NULL OR use_yn = '' OR UPPER(use_yn) = 'Y')
                """
                book_params = []
                if writer and writer not in ('전체', '(전체)', 'all'):
                    book_sql += " AND TRIM(writer) = ?"
                    book_params.append(writer)
                book_sql += " GROUP BY TRIM(book_name) ORDER BY name COLLATE NOCASE ASC"
                cursor.execute(book_sql, book_params)
                books = [{"name": r["name"], "count": r["cnt"]} for r in cursor.fetchall()]

                cursor.execute("""
                    SELECT region_nm AS name, COUNT(*) AS cnt
                    FROM tb_literature
                    WHERE region_nm IS NOT NULL AND TRIM(region_nm) != ''
                      AND (use_yn IS NULL OR use_yn = '' OR UPPER(use_yn) = 'Y')
                    GROUP BY region_nm
                    ORDER BY cnt DESC
                """)
                regions = [{"name": r["name"], "count": r["cnt"]} for r in cursor.fetchall()]

                conn.close()
                self.wfile.write(json.dumps({
                    "status": "success",
                    "data": {
                        "authors": authors,
                        "books": books,
                        "regions": regions,
                    },
                }, ensure_ascii=False).encode('utf-8'))
            except Exception as e:
                self.wfile.write(json.dumps({"status": "error", "message": str(e)}).encode('utf-8'))
            return

        # Region Culture Category API
        elif parsed_url.path == '/api/region_culture':
            self.send_response(200)
            self.send_header('Content-type', 'application/json; charset=utf-8')
            self.end_headers()
            
            q = query_params.get('q', [''])[0].strip()
            
            try:
                conn = sqlite3.connect(DB_PATH)
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()
                
                where_sql = ""
                params = []
                if q:
                    where_sql = "WHERE (p.title LIKE ? OR p.mean LIKE ? OR p.subject LIKE ? OR p.research_area LIKE ?)"
                    params = [f"%{q}%", f"%{q}%", f"%{q}%", f"%{q}%"]
                
                cursor.execute(f"""
                    SELECT p.subject, COUNT(DISTINCT p.region_photo_id) as total_count,
                           GROUP_CONCAT(DISTINCT p.research_area) as regions
                    FROM tb_region_photo p
                    WHERE p.use_yn = 'Y' AND p.subject IS NOT NULL AND p.subject != ''
                    {("AND " + where_sql[6:]) if where_sql else ""}
                    GROUP BY p.subject
                    ORDER BY total_count DESC
                """, params)
                
                rows = cursor.fetchall()
                categories = []
                for row in rows:
                    subject = row["subject"]
                    cursor.execute("""
                        SELECT p.title, p.mean, f.sys_file_name, f.file_ext
                        FROM tb_region_photo p
                        LEFT JOIN tb_region_photo_file f ON p.region_photo_id = f.region_photo_id
                        WHERE p.subject = ? AND p.use_yn = 'Y'
                        LIMIT 3
                    """, (subject,))
                    sample_items = []
                    for item in cursor.fetchall():
                        img_path = f"./image/{item['sys_file_name']}.{item['file_ext']}" if item["sys_file_name"] else "./image/200911310.jpg"
                        sample_items.append({
                            "title": item["title"],
                            "mean": item["mean"],
                            "img": img_path
                        })
                    
                    categories.append({
                        "subject": subject,
                        "total_count": row["total_count"],
                        "regions": row["regions"] or "전국",
                        "samples": sample_items
                    })
                
                conn.close()
                self.wfile.write(json.dumps({"status": "success", "data": categories}, ensure_ascii=False).encode('utf-8'))
            except Exception as e:
                self.wfile.write(json.dumps({"status": "error", "message": str(e)}).encode('utf-8'))
            return

        # Region Culture Item List API
        elif parsed_url.path == '/api/region_culture_list':
            self.send_response(200)
            self.send_header('Content-type', 'application/json; charset=utf-8')
            self.end_headers()
            
            subject = query_params.get('subject', [''])[0].strip()
            q = query_params.get('q', [''])[0].strip()
            
            try:
                conn = sqlite3.connect(DB_PATH)
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()
                
                where_clauses = ["p.use_yn = 'Y'"]
                params = []
                if subject:
                    where_clauses.append("p.subject = ?")
                    params.append(subject)
                if q:
                    where_clauses.append("(p.title LIKE ? OR p.mean LIKE ? OR p.cor_standard_language LIKE ? OR p.usage LIKE ?)")
                    params.extend([f"%{q}%", f"%{q}%", f"%{q}%", f"%{q}%"])
                    
                where_sql = " WHERE " + " AND ".join(where_clauses)
                
                cursor.execute(f"""
                    SELECT p.region_photo_id, p.title, p.mean, p.cor_standard_language, p.research_area, p.subject, p.usage,
                           f.sys_file_name, f.file_ext
                    FROM tb_region_photo p
                    LEFT JOIN tb_region_photo_file f ON p.region_photo_id = f.region_photo_id
                    {where_sql}
                    GROUP BY p.region_photo_id
                    ORDER BY CAST(p.region_photo_id AS INTEGER) ASC
                """, params)
                
                rows = cursor.fetchall()
                items = []
                for row in rows:
                    img_path = f"./image/{row['sys_file_name']}.{row['file_ext']}" if row["sys_file_name"] else "./image/200911310.jpg"
                    items.append({
                        "id": row["region_photo_id"],
                        "title": row["title"],
                        "mean": row["mean"],
                        "std": row["cor_standard_language"] or "",
                        "region": row["research_area"] or "전국",
                        "subject": row["subject"],
                        "usage": row["usage"] or "",
                        "img": img_path
                    })
                
                conn.close()
                self.wfile.write(json.dumps({"status": "success", "total": len(items), "data": items}, ensure_ascii=False).encode('utf-8'))
            except Exception as e:
                self.wfile.write(json.dumps({"status": "error", "message": str(e)}).encode('utf-8'))
            return
        # Region Culture Item Detail API
        elif parsed_url.path == '/api/region_culture_detail':
            self.send_response(200)
            self.send_header('Content-type', 'application/json; charset=utf-8')
            self.end_headers()
            
            photo_id = query_params.get('id', [''])[0].strip()
            
            try:
                conn = sqlite3.connect(DB_PATH)
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()
                
                cursor.execute("""
                    SELECT p.*
                    FROM tb_region_photo p
                    WHERE p.region_photo_id = ? AND p.use_yn = 'Y'
                """, (photo_id,))
                
                row = cursor.fetchone()
                if row:
                    # Fetch all attached photos
                    cursor.execute("""
                        SELECT sys_file_name, file_ext, ori_file_name
                        FROM tb_region_photo_file
                        WHERE region_photo_id = ?
                        ORDER BY CAST(file_idx AS INTEGER) ASC
                    """, (photo_id,))
                    file_rows = cursor.fetchall()
                    
                    images = []
                    for f in file_rows:
                        if f["sys_file_name"]:
                            images.append(f"./image/{f['sys_file_name']}.{f['file_ext']}")
                    if not images:
                        images = ["./image/200911310.jpg"]

                    # Fetch related items in same subject
                    subject = row["subject"]
                    cursor.execute("""
                        SELECT p.region_photo_id, p.title, p.mean, f.sys_file_name, f.file_ext
                        FROM tb_region_photo p
                        LEFT JOIN tb_region_photo_file f ON p.region_photo_id = f.region_photo_id
                        WHERE p.subject = ? AND p.region_photo_id != ? AND p.use_yn = 'Y'
                        GROUP BY p.region_photo_id
                        LIMIT 8
                    """, (subject, photo_id))
                    
                    related = []
                    for r in cursor.fetchall():
                        r_img = f"./image/{r['sys_file_name']}.{r['file_ext']}" if r["sys_file_name"] else "./image/200911310.jpg"
                        related.append({
                            "id": r["region_photo_id"],
                            "title": r["title"],
                            "mean": r["mean"] or "",
                            "img": r_img
                        })

                    detail = {
                        "id": row["region_photo_id"],
                        "title": row["title"],
                        "mean": row["mean"] or "",
                        "etc_info": row["etc_info"] or "",
                        "std": row["cor_standard_language"] or "",
                        "region": row["research_area"] or "전국",
                        "subject": row["subject"] or "",
                        "word_class": row["word_class"] or "",
                        "usage": row["usage"] or "",
                        "make_year": row["make_year"] or "",
                        "data_source": row["data_source"] or "민족생활어 조사 자료",
                        "another_name": row["another_name"] or "",
                        "images": images,
                        "related": related
                    }
                    self.wfile.write(json.dumps({"status": "success", "data": detail}, ensure_ascii=False).encode('utf-8'))
                else:
                    self.wfile.write(json.dumps({"status": "error", "message": "Item not found"}).encode('utf-8'))
                conn.close()
            except Exception as e:
                self.wfile.write(json.dumps({"status": "error", "message": str(e)}).encode('utf-8'))
            return

        # Map point detail — 지도 기호 클릭 팝업용 (tb_dialect_region)
        elif parsed_url.path == '/api/map_point':
            self.send_response(200)
            self.send_header('Content-type', 'application/json; charset=utf-8')
            self.end_headers()
            word = (query_params.get('word') or [''])[0].strip()
            std = (query_params.get('std') or query_params.get('headword') or [''])[0].strip()
            sido = (query_params.get('sido') or [''])[0].strip()
            sigungu = (query_params.get('sigungu') or [''])[0].strip()
            region = (query_params.get('region') or [''])[0].strip()
            try:
                conn = sqlite3.connect(DB_PATH)
                conn.row_factory = sqlite3.Row
                cur = conn.cursor()
                where = ["(use_yn IS NULL OR use_yn = '' OR UPPER(use_yn) = 'Y' OR use_yn = 'N')"]
                params = []
                # 지역어형 우선, 없으면 표준어
                if word:
                    where.append("(dlt_tp = ? OR dlt_tp LIKE ? OR dlt_tp LIKE ?)")
                    params.extend([word, word + '(%', '%|' + word + '%'])
                elif std:
                    where.append("(std_tp = ? OR dlt_tp = ?)")
                    params.extend([std, std])
                if sigungu:
                    where.append("(sigungu_nm = ? OR sigungu_nm LIKE ?)")
                    params.extend([sigungu, '%' + sigungu + '%'])
                if sido:
                    where.append("(sido_nm = ? OR sido_nm LIKE ?)")
                    params.extend([sido, '%' + sido.replace('특별자치', '').replace('광역시','').replace('특별시','')[:2] + '%'])
                if region and not (sido or sigungu):
                    where.append("(sido_nm || ' ' || IFNULL(sigungu_nm,'') LIKE ? OR IFNULL(sigungu_nm,'') LIKE ?)")
                    params.extend(['%' + region + '%', '%' + region.split()[-1] + '%'])
                sql = f"""
                    SELECT dlt_tp, std_tp, item_nm, source, serial_nm, basis_year,
                           sido_nm, sigungu_nm, sex, age, research_degree, file_memo, etc
                    FROM tb_dialect_region
                    WHERE {' AND '.join(where)}
                    ORDER BY
                      CASE WHEN dlt_tp = ? THEN 0 ELSE 1 END,
                      CAST(basis_year AS INTEGER) DESC
                    LIMIT 8
                """
                cur.execute(sql, params + [word or std or ''])
                rows = cur.fetchall()
                # 완화 재시도: 단어만
                if not rows and word:
                    cur.execute("""
                        SELECT dlt_tp, std_tp, item_nm, source, serial_nm, basis_year,
                               sido_nm, sigungu_nm, sex, age, research_degree, file_memo, etc
                        FROM tb_dialect_region
                        WHERE (dlt_tp = ? OR std_tp = ?)
                          AND (sigungu_nm = ? OR ? = '')
                        ORDER BY CAST(basis_year AS INTEGER) DESC
                        LIMIT 8
                    """, (word, word, sigungu, sigungu))
                    rows = cur.fetchall()
                conn.close()

                def sex_label(v):
                    s = str(v or '').strip()
                    if s in ('0', '남', '남성'):
                        return '남'
                    if s in ('1', '여', '여성'):
                        return '여'
                    return s or ''

                data = []
                for r in rows:
                    data.append({
                        "dltTp": r["dlt_tp"] or "",
                        "stdTp": r["std_tp"] or "",
                        "itemNm": r["item_nm"] or "",
                        "source": r["source"] or "",
                        "serialNm": r["serial_nm"] or "",
                        "basisYear": r["basis_year"] or "",
                        "sidoNm": r["sido_nm"] or "",
                        "sigunguNm": r["sigungu_nm"] or "",
                        "sex": sex_label(r["sex"]),
                        "age": r["age"] or "",
                        "researchDegree": r["research_degree"] or "",
                        "fileMemo": r["file_memo"] or "",
                        "etc": r["etc"] or "",
                    })
                self.wfile.write(json.dumps({
                    "status": "success",
                    "total": len(data),
                    "data": data,
                }, ensure_ascii=False).encode('utf-8'))
            except Exception as e:
                self.wfile.write(json.dumps({"status": "error", "message": str(e)}).encode('utf-8'))
            return

        return super().do_GET()

if __name__ == "__main__":
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("127.0.0.1", PORT), Handler) as httpd:
        print(f"Serving HTTP on 127.0.0.1 port {PORT} (http://127.0.0.1:{PORT}/) with API support...")
        httpd.serve_forever()
