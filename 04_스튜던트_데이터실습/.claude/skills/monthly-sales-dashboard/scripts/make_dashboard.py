"""월별 매출 파일(YYYY년_MM월_매출.xlsx)을 통합하고, 검증한 뒤, HTML 대시보드를 만든다.

사용: python make_dashboard.py <매출 폴더> <결과 폴더>
결과: <결과 폴더>/<연도>_매출_통합.xlsx, <연도>_매출_대시보드.html
검증에 실패하면 파일을 만들지 않고 종료 코드 1로 끝난다.
"""
import sys, re, json, unicodedata
from pathlib import Path
import openpyxl, pandas as pd

HERE = Path(__file__).resolve().parent
COLS = ['부서', '항목', '거래처', '담당자', '매출액', '비용', '이익']
MAP = {
    '부서': '부서', '팀명': '부서', 'Department': '부서',
    '항목': '항목', '매출항목': '항목', 'Category': '항목',
    '거래처': '거래처', '거래처명': '거래처', 'Client': '거래처',
    '담당자': '담당자', '담당': '담당자', 'Manager': '담당자',
    '매출액': '매출액', '매출(원)': '매출액', 'Revenue': '매출액',
    '비용': '비용', '원가(원)': '비용', 'Cost': '비용',
    '이익': '이익', '이익(원)': '이익', 'Profit': '이익',
}
problems = []


def stop():
    print('\n[중단] 아래 문제를 먼저 확인해야 해요. 파일은 만들지 않았어요.')
    for p in problems: print(' -', p)
    sys.exit(1)


# ---------- 1. 파일 찾기 ----------
src, out_dir = Path(sys.argv[1]), Path(sys.argv[2])
files = {}
for f in sorted(src.iterdir()):
    name = unicodedata.normalize('NFC', f.name)
    if f.name.startswith('~$') or f.suffix.lower() != '.xlsx':
        continue
    m = re.fullmatch(r'(\d{4})년_(\d{1,2})월_매출\.xlsx', name)
    if not m:
        problems.append(f'이름 규칙(YYYY년_MM월_매출.xlsx)과 다른 파일: {name}')
        continue
    key = (int(m.group(1)), int(m.group(2)))
    if key in files:
        problems.append(f'같은 달 파일이 두 개예요: {files[key].name}, {name}')
    files[key] = f
if not files:
    problems.append('매출 파일을 하나도 찾지 못했어요.')
years = sorted({y for y, _ in files})
if len(years) > 1:
    problems.append(f'여러 연도가 섞여 있어요: {years}. 한 연도씩 따로 만들어주세요.')
if problems: stop()
YEAR = years[0]

# ---------- 2. 읽고 머리글 맞추기 ----------
frames, per_file = [], {}
for (y, month), f in sorted(files.items()):
    ws = openpyxl.load_workbook(f, data_only=True).worksheets[0]
    rows = list(ws.iter_rows(values_only=True))
    raw_hdr = [str(h).strip() if h is not None else '' for h in rows[0]]
    unknown = [h for h in raw_hdr if h and h not in MAP]
    if unknown:
        problems.append(f'{f.name}: 모르는 머리글 {unknown} → 스크립트의 MAP에 어떤 열인지 추가해야 해요.')
        continue
    hdr = [MAP.get(h, f'_빈열{i}') for i, h in enumerate(raw_hdr)]
    missing = [c for c in COLS if c not in hdr]
    if missing:
        problems.append(f'{f.name}: 필요한 열이 없어요 {missing}')
        continue
    df = pd.DataFrame(rows[1:], columns=hdr)[COLS].dropna(how='all')
    for c in COLS[:4]:
        df[c] = df[c].astype(str).str.strip()
    for c in COLS[4:]:
        num = pd.to_numeric(df[c], errors='coerce')
        if num.isna().any():
            problems.append(f'{f.name}: {c} 열에 숫자가 아닌 값이 {int(num.isna().sum())}칸 있어요.')
        df[c] = num
    df.insert(0, '월', month)
    frames.append(df)
    per_file[f.name] = int(df['매출액'].sum(skipna=True))
if problems: stop()

df = pd.concat(frames, ignore_index=True)
for c in COLS[4:]:
    df[c] = df[c].round().astype('int64')

# ---------- 3. 검증 ----------
bad = df[df['매출액'] - df['비용'] != df['이익']]
if len(bad):
    problems.append(f'매출 − 비용 ≠ 이익인 행이 {len(bad)}개 있어요:\n{bad.to_string()}')
if df['매출액'].sum() != sum(per_file.values()):
    problems.append('통합 매출 합계가 원본 파일 합계와 달라요.')
if (df['매출액'] <= 0).any():
    problems.append(f'매출액이 0 이하인 행이 {int((df["매출액"] <= 0).sum())}개 있어요.')
dups = int(df.duplicated().sum())
if problems: stop()

MONTHS = sorted(df['월'].unique().tolist())
gaps = [m for m in range(MONTHS[0], MONTHS[-1] + 1) if m not in MONTHS]
DEPTS = df.groupby('부서')['매출액'].sum().sort_values(ascending=False).index.tolist()

# ---------- 4. 통합 엑셀 ----------
out_dir.mkdir(parents=True, exist_ok=True)
out_xlsx = out_dir / f'{YEAR}_매출_통합.xlsx'
out_html = out_dir / f'{YEAR}_매출_대시보드.html'
with pd.ExcelWriter(out_xlsx, engine='openpyxl') as w:
    df.to_excel(w, sheet_name='통합데이터', index=False)
    ws = w.sheets['통합데이터']
    for col, width in zip('ABCDEFGH', [6, 12, 18, 16, 10, 15, 15, 15]):
        ws.column_dimensions[col].width = width
    for row in ws.iter_rows(min_row=2, min_col=6, max_col=8):
        for c in row:
            c.number_format = '#,##0'

# ---------- 5. 인사이트 (모두 데이터에서 계산) ----------
E = 1e8
NM = len(MONTHS)
period = f'{MONTHS[0]}~{MONTHS[-1]}월' if NM > 1 else f'{MONTHS[0]}월'
tot = df[['매출액', '비용', '이익']].sum()
avg_mg = tot['이익'] / tot['매출액'] * 100
m = df.groupby('월')[['매출액', '이익']].sum()
m['mg'] = m['이익'] / m['매출액'] * 100
peak = int(m['매출액'].idxmax())


def eok(v): return f'{v / E:.1f}억 원'
def name(idx): return f'{idx[0]} {idx[1]}'


insights = []
if NM >= 2:
    top2 = m['매출액'].nlargest(2).index.sort_values().tolist()
    top2_share = m.loc[top2, '매출액'].sum() / tot['매출액'] * 100
    mom = m['매출액'].pct_change() * 100
    drop_m = int(mom.idxmin())
    t = f'{peak}월 매출이 {eok(m.loc[peak, "매출액"])}으로 가장 높았고, 매출 상위 두 달({top2[0]}월·{top2[1]}월)이 {NM}개월 매출의 {top2_share:.1f}%를 차지했어요. '
    if mom[drop_m] < 0:
        t += f'{drop_m}월에는 {"전월" if not gaps else "직전 자료 달"}보다 {abs(mom[drop_m]):.1f}% 줄어 가장 크게 떨어졌어요.'
    last = MONTHS[-1]
    prev_word = '전월' if not gaps else '직전 자료 달'
    t += f' 최근 달인 {last}월은 {prev_word}보다 {abs(mom[last]):.1f}% {"늘었어요" if mom[last] >= 0 else "줄었어요"}.'
    insights.append(dict(t='월별 매출 흐름', b=t))
    top2_mg = m.loc[top2, '이익'].sum() / m.loc[top2, '매출액'].sum() * 100
    cmp = '낮았어요' if top2_mg < avg_mg else '높았어요'
    insights.append(dict(t='월별 이익률',
        b=f'이익률은 {int(m["mg"].idxmin())}월에 {m["mg"].min():.1f}%로 가장 낮고, {int(m["mg"].idxmax())}월에 {m["mg"].max():.1f}%로 가장 높았어요. '
          f'매출 상위 두 달의 이익률({top2_mg:.1f}%)은 {NM}개월 평균({avg_mg:.1f}%)보다 {cmp}.'))

d = df.groupby('부서')[['매출액', '이익']].sum()
d['mg'] = d['이익'] / d['매출액'] * 100
top_d, mg_d = d['매출액'].idxmax(), d['mg'].idxmax()
t = (f'{len(d)}개 부서가 각각 전체의 {d["매출액"].min() / tot["매출액"] * 100:.1f}~{d["매출액"].max() / tot["매출액"] * 100:.1f}%를 차지해요. '
     f'매출 1위는 {top_d}, 이익률 1위는 {mg_d}({d.loc[mg_d, "mg"]:.1f}%)예요.')
if NM >= 3:
    piv = df.pivot_table(index='부서', columns='월', values='매출액', aggfunc='sum').fillna(0)
    cv = piv.std(axis=1) / piv.mean(axis=1) * 100
    t += f' 월별 변동이 가장 큰 곳은 {cv.idxmax()}(변동계수 {cv.max():.0f}%), 가장 안정적인 곳은 {cv.idxmin()}({cv.min():.0f}%)예요.'
insights.append(dict(t='부서별 비교', b=t))

it = df.groupby(['부서', '항목'])[['매출액', '이익']].sum()
it['mg'] = it['이익'] / it['매출액'] * 100
lo, hi = it.sort_values('mg').head(2), it.sort_values('mg', ascending=False).head(2)
insights.append(dict(t='이익률이 낮은 항목 점검 필요',
    b=f'{name(lo.index[0])}({lo.iloc[0]["mg"]:.1f}%)와 {name(lo.index[1])}({lo.iloc[1]["mg"]:.1f}%)의 이익률이 가장 낮아요. '
      f'반면 {name(hi.index[0])}({hi.iloc[0]["mg"]:.1f}%), {name(hi.index[1])}({hi.iloc[1]["mg"]:.1f}%)는 가장 높아요.'))

c = df.groupby('거래처')['매출액'].sum().sort_values(ascending=False)
top_c = c.index[0]
top_c_months = df[df['거래처'] == top_c]['월'].nunique()
insights.append(dict(t='거래처 비중',
    b=f'상위 3개 거래처가 매출의 {c.head(3).sum() / tot["매출액"] * 100:.1f}%예요. 1위 거래처 {top_c}의 비중은 '
      f'{c.iloc[0] / tot["매출액"] * 100:.1f}%이고, '
      + (f'{NM}개월 모두 거래가 있었어요.' if top_c_months == NM else f'{NM}개월 중 {top_c_months}개월 거래가 있었어요.')))

a = df.groupby('담당자').agg(매출=('매출액', 'sum'), 건=('매출액', 'size'))
top_a = a['매출'].idxmax()
insights.append(dict(t='담당자별 실적 차이',
    b=f'담당자 {top_a}의 실적이 {a.loc[top_a, "건"]}건, {eok(a.loc[top_a, "매출"])}으로 매출 1위예요. '
      f'담당자 {len(a)}명 중 가장 적은 실적과 약 {a["매출"].max() / a["매출"].min():.1f}배 차이가 나요.'))

headline = (f'{YEAR}년 {period} 매출은 {eok(tot["매출액"])}, 이익은 {eok(tot["이익"])}(이익률 {avg_mg:.1f}%)이에요. '
            f'매출이 가장 컸던 달은 {peak}월이에요.')

# ---------- 6. HTML ----------
fnames = [f.name for _, f in sorted(files.items())]
files_txt = fnames[0] if len(fnames) == 1 else f'{fnames[0]} ~ {fnames[-1]}'
missing_txt = f'{", ".join(map(str, gaps))}월 파일은 없어 빠져 있어요.' if gaps else ''
meta = dict(year=YEAR, months=MONTHS, depts=DEPTS, period=period)
payload = dict(rows=df.to_dict(orient='records'), insights=insights, headline=headline, meta=meta)
html = (HERE / 'template.html').read_text(encoding='utf-8')
for k, v in {'YEAR': YEAR, 'PERIOD': period, 'NFILES': len(files), 'NDEPTS': len(DEPTS), 'NROWS': len(df),
             'NMONTHS': NM, 'SOURCE': unicodedata.normalize('NFC', src.name), 'FILES': files_txt, 'MISSING': missing_txt}.items():
    html = html.replace('{{' + k + '}}', str(v))
html = html.replace('/*__DATA__*/null', json.dumps(payload, ensure_ascii=False))
assert '{{' not in html, '채우지 못한 자리표시가 있어요'
out_html.write_text(html, encoding='utf-8')

# ---------- 7. 요약 출력 ----------
print(f'[완료] {YEAR}년 {period} · 파일 {len(files)}개 · {len(df)}건')
print(f'매출 {tot["매출액"]:,}원 · 비용 {tot["비용"]:,}원 · 이익 {tot["이익"]:,}원 (이익률 {avg_mg:.1f}%)')
print('검증: 모든 행 매출−비용=이익 OK · 통합 합계 = 원본 파일 합계 OK')
if gaps: print(f'주의: {gaps}월 파일이 없어요.')
if dups: print(f'주의: 완전히 같은 행이 {dups}개 있어요(지우지 않았어요).')
print('월별 매출:', ' | '.join(f'{k}월 {v / E:.1f}억' for k, v in m['매출액'].items()))
print('통합 엑셀:', out_xlsx)
print('대시보드:', out_html)
print('\n[인사이트]')
print(headline)
for i in insights: print('-', i['t'], '|', i['b'])
