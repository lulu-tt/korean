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


def survey_def(con, row):
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
    return {
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


def main():
    """인자 없이 실행하면 '기간 안에 있고 문항이 있는' 설문 전체를 내보낸다.
    설문 번호를 주면(여러 개 가능) 그 설문만 내보낸다."""
    ids = sys.argv[1:]
    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row

    if ids:
        rows = [con.execute('SELECT * FROM tb_survey_new WHERE survey_no=?', (str(i),)).fetchone()
                for i in ids]
        rows = [r for r in rows if r]
    else:
        now_ms = int(datetime.datetime.now().timestamp() * 1000)
        rows = con.execute("""SELECT * FROM tb_survey_new
                              WHERE CAST(start_date AS INTEGER) <= ? AND CAST(end_date AS INTEGER) >= ?
                                AND EXISTS (SELECT 1 FROM tb_survey_question_new q
                                            WHERE q.survey_no = tb_survey_new.survey_no)
                              ORDER BY CAST(survey_no AS INTEGER) DESC""",
                           (now_ms, now_ms)).fetchall()
    if not rows:
        sys.exit('내보낼 설문이 없습니다.')

    surveys = [survey_def(con, r) for r in rows]
    io.open(OUT, 'w', encoding='utf-8').write(
        json.dumps({'status': 'success', 'data': surveys[0], 'surveys': surveys, 'static': True},
                   ensure_ascii=False, indent=1))
    for d in surveys:
        print('설문 #%s "%s" — 문항 %d개 / 보기 %d개 · 기간 %s ~ %s · 개인정보 수집 %s'
              % (d['surveyNo'], d['surveyTitle'], len(d['questions']),
                 sum(len(q['examples']) for q in d['questions']),
                 d['startDate'], d['endDate'], d['prsnlInputYn']))
    print('저장:', OUT)


if __name__ == '__main__':
    main()
