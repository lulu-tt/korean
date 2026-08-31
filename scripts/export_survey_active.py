#!/usr/bin/env python3
"""메인 설문 팝업의 정적 대체본을 만든다.

GitHub Pages 에는 server.py 가 없어 /api/survey/active 가 404 다.
index.html 은 API 가 없으면 이 파일을 읽어 팝업을 띄운다.

내보내는 것은 설문 '정의'뿐이다 — 제목·안내·기간·문항·보기.
응답자 자료(tb_survey_answer_new / 개인정보)는 공개 저장소에 절대 넣지 않는다.
"""
import datetime
import io
import json
import os
import sqlite3
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.path.join(ROOT, 'dialect_local.db')
OUT = os.path.join(ROOT, 'data', 'processed', 'survey_active.json')


def ymd(ms):
    try:
        return datetime.datetime.fromtimestamp(int(ms) / 1000).strftime('%Y-%m-%d')
    except (ValueError, TypeError, OverflowError, OSError):
        return ''


def main():
    sid = sys.argv[1] if len(sys.argv) > 1 else None
    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row

    if sid:
        row = con.execute('SELECT * FROM tb_survey_new WHERE survey_no=?', (str(sid),)).fetchone()
    else:
        # 문항이 가장 많은 설문 = 실제로 운영된 것
        row = con.execute("""SELECT s.* FROM tb_survey_new s
                             ORDER BY (SELECT COUNT(*) FROM tb_survey_question_new q
                                       WHERE q.survey_no = s.survey_no) DESC,
                                      CAST(s.survey_no AS INTEGER) DESC
                             LIMIT 1""").fetchone()
    if not row:
        sys.exit('tb_survey_new 에 설문이 없습니다.')
    sid = str(row['survey_no'])

    questions = []
    for q in con.execute("""SELECT question_no, question_title FROM tb_survey_question_new
                            WHERE survey_no=?
                            ORDER BY CAST(question_order AS INTEGER), CAST(question_no AS INTEGER)""",
                         (sid,)):
        questions.append({
            'questionNo': str(q['question_no']),
            'questionTitle': q['question_title'] or '',
            'examples': [{'exampleNo': str(e['example_no']), 'exampleTitle': e['example_title'] or ''}
                         for e in con.execute("""SELECT example_no, example_title
                                                 FROM tb_survey_example_new WHERE question_no=?
                                                 ORDER BY CAST(example_no AS INTEGER)""",
                                              (q['question_no'],))],
        })

    data = {
        'surveyNo': sid,
        'surveyTitle': row['survey_title'] or '',
        'surveyCntnts': row['survey_cntnts'] or '',
        'startDate': ymd(row['start_date']),
        'endDate': ymd(row['end_date']),
        'prsnlInputYn': (row['prsnl_input_yn'] or 'N').upper(),
        'prsnlInfoCntnts': row['prsnl_info_cntnts'] or '',
        'questionCnt': len(questions),
        'questions': questions,
    }
    io.open(OUT, 'w', encoding='utf-8').write(
        json.dumps({'status': 'success', 'data': data, 'static': True},
                   ensure_ascii=False, indent=1))
    print('설문 #%s "%s" — 문항 %d개 / 보기 %d개'
          % (sid, data['surveyTitle'], len(questions),
             sum(len(q['examples']) for q in questions)))
    print('기간 %s ~ %s · 개인정보 수집 %s' % (data['startDate'], data['endDate'], data['prsnlInputYn']))
    print('저장:', OUT)


if __name__ == '__main__':
    main()
