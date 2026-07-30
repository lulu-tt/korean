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

        # Literature Dialect List API
        elif parsed_url.path == '/api/literatures':
            self.send_response(200)
            self.send_header('Content-type', 'application/json; charset=utf-8')
            self.end_headers()
            
            q = query_params.get('q', [''])[0].strip()
            region = query_params.get('region', [''])[0].strip()
            writer = query_params.get('writer', [''])[0].strip()
            book = query_params.get('book', [''])[0].strip()
            page = int(query_params.get('page', [1])[0])
            limit = int(query_params.get('limit', [30])[0])
            offset = (page - 1) * limit
            
            try:
                conn = sqlite3.connect(DB_PATH)
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()
                
                where_clauses = []
                params = []
                
                if q:
                    where_clauses.append("(l.dlt_tp LIKE ? OR l.std_tp LIKE ? OR l.mean LIKE ? OR l.rel_dlt LIKE ? OR l.region_nm LIKE ? OR e.word_example LIKE ? OR e.writer LIKE ? OR e.book_name LIKE ?)")
                    params.extend([f"%{q}%", f"%{q}%", f"%{q}%", f"%{q}%", f"%{q}%", f"%{q}%", f"%{q}%", f"%{q}%"])
                if region:
                    where_clauses.append("l.region_nm LIKE ?")
                    params.append(f"%{region}%")
                if writer:
                    where_clauses.append("e.writer LIKE ?")
                    params.append(f"%{writer}%")
                if book:
                    where_clauses.append("e.book_name LIKE ?")
                    params.append(f"%{book}%")
                    
                where_sql = " WHERE " + " AND ".join(where_clauses) if where_clauses else ""
                
                # Count Query
                cursor.execute(f"""
                    SELECT COUNT(DISTINCT l.liter_id) as total 
                    FROM tb_literature l 
                    LEFT JOIN tb_literature_example e ON l.liter_id = e.liter_id 
                    {where_sql}
                """, params)
                total_count = cursor.fetchone()["total"]
                
                # Main Query
                cursor.execute(f"""
                    SELECT l.liter_id, l.dlt_tp, l.std_tp, l.word_class, l.mean, l.region_nm, l.rel_dlt, l.word_desc
                    FROM tb_literature l
                    LEFT JOIN tb_literature_example e ON l.liter_id = e.liter_id
                    {where_sql}
                    GROUP BY l.liter_id
                    ORDER BY CAST(l.liter_id AS INTEGER) ASC
                    LIMIT ? OFFSET ?
                """, params + [limit, offset])
                
                lit_rows = cursor.fetchall()
                result = []
                
                for row in lit_rows:
                    liter_id = row["liter_id"]
                    # Fetch examples
                    cursor.execute("""
                        SELECT word_example, std_example, writer, book_name, publish_company, publish_year, page_no
                        FROM tb_literature_example
                        WHERE liter_id = ?
                    """, (liter_id,))
                    examples = []
                    for ex in cursor.fetchall():
                        examples.append({
                            "example": ex["word_example"],
                            "std_example": ex["std_example"],
                            "writer": ex["writer"],
                            "book_name": ex["book_name"],
                            "publish_year": ex["publish_year"],
                            "page_no": ex["page_no"]
                        })
                    
                    result.append({
                        "liter_id": row["liter_id"],
                        "dlt_tp": row["dlt_tp"],
                        "std_tp": row["std_tp"],
                        "word_class": row["word_class"],
                        "mean": row["mean"],
                        "region_nm": row["region_nm"],
                        "rel_dlt": row["rel_dlt"],
                        "word_desc": row["word_desc"],
                        "examples": examples
                    })
                
                conn.close()
                self.wfile.write(json.dumps({
                    "status": "success",
                    "total": total_count,
                    "page": page,
                    "limit": limit,
                    "data": result
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

        return super().do_GET()

if __name__ == "__main__":
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("127.0.0.1", PORT), Handler) as httpd:
        print(f"Serving HTTP on 127.0.0.1 port {PORT} (http://127.0.0.1:{PORT}/) with API support...")
        httpd.serve_forever()
