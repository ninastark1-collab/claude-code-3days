# probe-text

실행 시간 12.6s · PASS 3 · FAIL 1 · WARN 1 · SKIP 0 · INFO 0

| 결과 | ID | 심각도 | 담당 | 내용 |
|---|---|---|---|---|
| FAIL | C5-01 | S3 | 개발 | 조사 병기 68곳 (59줄) — 받침에 따라 조사를 고르는 함수 필요, 문장은 시나리오 참조 |
| WARN | C5-03 |  | 시나리오 | 혼용 용어 군량/병량, 무장/장수 — 하나로 통일할지 결정 |
| PASS | C5-01 |  |  | 실행 문장 1294개 조사 오류 없음 |
| PASS | C5-04 |  |  | 영문 id 노출 없음 |
| PASS | C5-04 |  |  | 깨진 값 없음 |

## 상세

### FAIL C5-01

```
src\engine\battle\battle.ts:405: b.log.push(`${u.name}이(가) ${by ? by.name + '에게 ' : ''}사로잡혔다!`);
src\engine\battle\battle.ts:480: b.log.push(`${u.name}이(가) 병사들을 고무했다!`);
src\engine\battle\battle.ts:493: } else b.log.push(`${target.name}이(가) ${u.name}의 계략을 간파했다.`);
src\engine\battle\battle.ts:553: outcome = `${winner.name}이(가) ${loser.name}을(를) 베었다!`;
src\engine\battle\battle.ts:556: outcome = `${winner.name}이(가) ${loser.name}을(를) 사로잡았다!`;
src\engine\battle\battle.ts:560: outcome = `${loser.name}이(가) 말머리를 돌려 달아났다!`;
src\engine\battle\report.ts:74: else if (!win && mv < 0 && enP) advice = `적은 ${POLICIES[enP].name}(으)로 나왔습니다. 이 방침에는 ${POLICIES[enP].weak} 쪽이 
src\engine\commands.ts:31: if (o.acted) return `${oname(g, officerId)}은(는) 이번 달 이미 명령을 수행했습니다.`;
src\engine\commands.ts:55: if (c[kind] >= max) return fail(`${DEVELOP_LABEL[kind]}이(가) 이미 최대입니다.`);
src\engine\commands.ts:135: return ok(`${b.name}: 재야의 인재 ${oname(g, t.id)}을(를) 발견했습니다!`);
src\engine\commands.ts:196: if (cd > 0) return fail(`${oname(g, targetId)}은(는) 최근 등용 권유를 거절해 경계 중입니다 (${cd}개월 후 가능).`);
src\engine\commands.ts:211: return ok(`${oname(g, targetId)}이(가) 등용을 거절했습니다. (확률 ${p}%)`);
src\engine\commands.ts:214: return ok(`${oname(g, targetId)}이(가) ${fname(g, o.faction)}에 합류했습니다!`);
src\engine\commands.ts:223: else addLog(g.s, `${oname(g, officerId)}이(가) ${fname(g, faction)}에 합류`);
src\engine\commands.ts:294: return ok(`${oname(g, officerId)}을(를) ${cname(g, cityId)} 태수로 임명`);
src\engine\commands.ts:321: if (t.acted) return fail(`${name}은(는) 이번 달 이미 설득했습니다.`);
src\engine\commands.ts:329: return ok(`${name}이(가) 투항했습니다.`);
src\engine\commands.ts:332: if (onRelease(g, captiveId, faction)) return ok(`${name}이(가) 마음으로 복종했습니다.`);
src\engine\commands.ts:338: return ok(`${name}을(를) 풀어주었습니다.`);
src\engine\commands.ts:347: return ok(`${name}을(를) 처형했습니다.`);
src\engine\commands.ts:384: return ok(`${b.name}: ${fname(g, target)}과(와) 친선 (우호 ${r.friendship})`);
src\engine\commands.ts:410: return ok(`${fname(g, target)}이(가) ${type === 'alliance' ? '동맹' : '정전'} 제안을 거절했습니다.`);
src\engine\commands.ts:413: return ok(`${fname(g, target)}과(와) ${type === 'alliance' ? '동맹' : '정전'}을 맺었습니다!`);
src\engine\commands.ts:428: if (!aiAccepts(g, o.faction!, target, 'surrender', officerId)) return ok(`${fname(g, target)}이(가) 항복 권고를 거절했습니
src\engine\commands.ts:430: return ok(`${fname(g, target)}이(가) 항복했습니다!`);
src\engine\commands.ts:452: g.s.messages.push({ title: '항복', text: `${fname(g, loser)}이(가) ${fname(g, winner)}에 항복했습니다.`, kind: 'war' });
src\engine\commands.ts:503: if (cdLeft > 0) return fail(`${oname(g, targetId)}은(는) 최근 이간을 당해 경계 중입니다 (${cdLeft}개월 후 가능).`);
src\engine\commands.ts:538: if (!o || o.status !== 'serving' || o.faction !== faction || o.city !== from) return `${oname(g, id)}은(는) 출진할 
src\engine\commands.ts:539: if (o.acted) return `${oname(g, id)}은(는) 이번 달 이미 행동했습니다.`;
src\engine\events.ts:97: text: `장안을 탈출한 헌제를 ${fname(g, holder)}이(가) 맞아들였다. 천자를 끼고 제후를 호령할 대의명분을 얻었다. (등용 성공률 상승)`,
src\engine\events.ts:151: text: `"유장은 어리석어 익주를 지킬 그릇이 못 됩니다." 장송이 서촉의 지형도를 바치고 ${joined.join('·')}이(가) 유비에게 몸을 맡겼다.`,
src\engine\events.ts:172: addLog(g.s, `고평릉 정변: 사마의가 ${oname(g, old)}을(를) 몰아냄`);
src\engine\events.ts:176: text: `오랫동안 병을 핑계로 몸을 낮추던 사마의가 황제의 능 참배 틈을 타 군사를 일으켰다. ${oname(g, old)}은(는) 실권을 잃고, 세력의 실권은 사마씨에게 넘어갔다.`,
src\engine\events.ts:194: text: `천하의 3분의 1을 차지한 ${oname(g, f.ruler)}이(가) 스스로 황제에 올랐다. 휘하 무장들의 충성이 높아졌다.`,
src\engine\events.ts:228: text: `"형님이 계신 곳이라면 천 리 길도 멀지 않다!" ${b.name}이(가) ${fname(g, from)}을(를) 떠나 ${oname(g, target.ruler)}에게 돌아갔다.`,
src\engine\save.ts:150: if (!m) return { ok: false, error: `세이브 v${p.saveVersion}을(를) 변환할 수 없습니다.` };
src\engine\turn.ts:190: addLog(s, `${b.name}이(가) ${fname(g, from)}을(를) 떠남`);
src\engine\turn.ts:191: if (from === s.playerFaction) s.messages.push({ title: '출분', text: `${b.name}이(가) 불만을 품고 떠났습니다.`, kind: 'notic
src\engine\turn.ts:208: s.messages.push({ title: '성인', text: `${oname(g, b.father!)}의 자식 ${b.name}이(가) 성인이 되어 출사했습니다.`, kind: 'info' }
src\engine\turn.ts:227: g.s.messages.push({ title: '조약 만료', text: `${fname(g, a === g.s.playerFaction ? b : a)}과(와)의 ${r.treaty === 'a
src\engine\turn.ts:243: s.ending = { type: 'defeat', text: `${me.name}은(는) 역사 속으로 사라졌다...` };
src\engine\turn.ts:251: text: `${s.year}년, ${oname(g, me.ruler)}이(가) 마침내 천하를 통일했다! 오랜 난세가 끝나고 새 시대가 열렸다.`,
src\engine\turn.ts:303: return `${fname(g, p.from)}과(와) ${p.type === 'alliance' ? '동맹' : '정전'}을 맺었습니다.`;
src\engine\war.ts:83: addLog(g.s, `${fname(g, setup.attacker)}이(가) ${cname(g, setup.city)} 점령${prevOwner ? ` (${fname(g, prevOwner)}
src\engine\war.ts:87: text: `${fname(g, setup.attacker)}이(가) ${cname(g, setup.city)}을(를) 점령했습니다.`,
src\engine\war.ts:112: addLog(g.s, `${oname(g, officerId)}이(가) ${fname(g, captor)}에게 사로잡힘`);
src\engine\war.ts:114: g.s.messages.push({ title: '군주 포로', text: `${fname(g, o.faction)}의 군주 ${oname(g, officerId)}이(가) 사로잡혔습니다!`, ki
src\engine\war.ts:187: text: `${fname(g, defFaction)}이(가) ${cname(g, setup.city)}을(를) 지켜냈습니다. (${r.reason})`,
src\engine\war.ts:217: g.s.messages.push({ title: cause, text: `${oname(g, officerId)}이(가) ${cause}했습니다.`, kind: 'death' });
src\engine\war.ts:248: addLog(g.s, `${fname(g, faction)}: ${oname(g, heir.id)}이(가) 뒤를 이음`);
src\engine\war.ts:249: g.s.messages.push({ title: '군주 계승', text: `${fname(g, faction)}의 새 군주로 ${oname(g, heir.id)}이(가) 즉위했습니다.`, kind
src\engine\war.ts:290: g.s.messages.push({ title: '세력 멸망', text: `${f.name}이(가) 멸망했습니다.`, kind: 'war' });
src\ui\components\Commands.tsx:487: <b>{g.ix.officer.get(target)!.name}</b>을(를) 설득할 무장을 고르세요.{' '}
src\ui\components\Commands.tsx:573: if (window.confirm(`정말 ${b.name}을(를) 처형하시겠습니까? 되돌릴 수 없습니다.`)) run((gg) => handleCaptive(gg, me, o.id, 'execute
src\ui\screens\Battle.tsx:277: 「{pol.name}」(으)로 싸웁니다. 확정하면 전투가 끝날 때까지 명령을 바꿀 수 없습니다.
src\ui\screens\Battle.tsx:889: ? `「${when}, ${wl?.name}이(가) ${b.cityName}을(를) 쳐서 ${ll?.name ?? '수비군'}을(를) 몰아내고 성을 얻었다.」`
src\ui\screens\Battle.tsx:890: : `「${when}, ${wl?.name ?? '수비군'}이(가) ${b.cityName}을(를) 굳게 지켜 ${ll?.name ?? '적'}의 군세를 물리쳤다.」`;
src\ui\screens\Strategy.tsx:463: {atk.name}이(가) {g.ix.city.get(setup.from)!.name}에서 <b style={{ color: 'var(--g-text)', letterSpacing: 0 }}>{g.
src\ui\screens\Strategy.tsx:464: (으)로 쳐들어왔다.
```

### WARN C5-03

```
군량 7 / 병량 5
무장 46 / 장수 12
계략 4 / 계책 0
병력 19 / 병사 수 0
태수 5 / 도독 0
```
