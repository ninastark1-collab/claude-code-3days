#!/usr/bin/env bash
# QA 자동 검사 일괄 실행. 프로젝트 루트에서: bash qa/scripts/run-auto.sh [quick]
#   quick: 장기 진행·전투 표본을 줄여 빠르게 (약 2~3분)
# 결과: qa/results/<시각>/summary.md 와 각 프로브 보고서
set -u
cd "$(dirname "$0")/../.."
STAMP=$(date +%Y%m%d-%H%M%S)
OUT="qa/results/$STAMP"
mkdir -p "$OUT"
export QA_OUT="$OUT"
MODE="${1:-full}"
if [ "$MODE" = quick ]; then SIM_ARGS="all 5 1"; BATTLES=40; PLAN_N=6; else SIM_ARGS="all 25 3"; BATTLES=150; PLAN_N=20; fi

declare -a NAMES CODES
step() { # 이름, 명령...
  local name="$1"; shift
  echo "▶ $name"
  "$@" >"$OUT/$name.log" 2>&1
  local code=$?
  NAMES+=("$name"); CODES+=("$code")
  echo "  └ 종료 코드 $code ($OUT/$name.log)"
}

{
  echo "빌드 정보"
  echo "- 검사 시각: $STAMP"
  echo "- package.json 버전: $(node -p "require('./package.json').version")"
  echo "- 가장 최근 수정된 소스: $(find src data -type f -printf '%TY-%Tm-%Td %TH:%TM %p\n' 2>/dev/null | sort | tail -1)"
  echo "- 설치파일: $(ls -1 release/*.exe 2>/dev/null | tr '\n' ' ')"
} >"$OUT/build-info.md"

step typecheck      npx tsc --noEmit
step unit-tests     npx vitest run
step validate-data  npx tsx scripts/validate-data.ts
step probe-data     npx tsx qa/scripts/probe-data.ts
step probe-text     npx tsx qa/scripts/probe-text.ts
step probe-save     npx tsx qa/scripts/probe-save.ts
step probe-battle   npx tsx qa/scripts/probe-battle.ts "$BATTLES"
step probe-plan     npx tsx qa/scripts/probe-plan.ts "$PLAN_N"
step probe-edge     npx tsx qa/scripts/probe-edge.ts
# 모바일 에뮬레이션: 최신 스냅숏이 있으면 그것, 없으면 임시 빌드
SNAP=$(cat qa/snapshots/LATEST.txt 2>/dev/null || true)
if [ -z "$SNAP" ] || [ ! -f "$SNAP/index.html" ]; then SNAP="${TMPDIR:-/tmp}/samgukji-qa-autobuild"; npx vite build --outDir "$SNAP" --emptyOutDir >"$OUT/mobile-build.log" 2>&1 || SNAP=""; fi
if [ -n "$SNAP" ]; then if [ "$MODE" = quick ]; then DEV=iphone14,galaxyA; else DEV=all; fi; step probe-mobile npx electron qa/scripts/probe-mobile.cjs "$SNAP" "$DEV" "$OUT"; else echo "빌드 실패로 probe-mobile 생략 (S1 후보)" >"$OUT/probe-mobile.log"; NAMES+=(probe-mobile); CODES+=(99); fi
# shellcheck disable=SC2086
step probe-sim      npx tsx qa/scripts/probe-sim.ts $SIM_ARGS

{
  echo "# 자동 검사 요약 ($STAMP, $MODE)"
  echo
  cat "$OUT/build-info.md"
  echo
  echo "| 단계 | 종료 코드 | 결과 |"
  echo "|---|---|---|"
  for i in "${!NAMES[@]}"; do
    n="${NAMES[$i]}"; c="${CODES[$i]}"
    line=""
    if [ -f "$OUT/$n.md" ]; then line=$(sed -n 3p "$OUT/$n.md"); else line=$(tail -3 "$OUT/$n.log" | tr '\n' ' ' | cut -c1-160); fi
    echo "| $n | $c | $line |"
  done
  echo
  echo "## FAIL 모음"
  echo
  for f in "$OUT"/probe-*.md; do grep -h '^| FAIL' "$f" 2>/dev/null; done
  echo
  echo "## WARN 모음"
  echo
  for f in "$OUT"/probe-*.md; do grep -h '^| WARN' "$f" 2>/dev/null; done
} >"$OUT/summary.md"

echo
echo "요약: $OUT/summary.md"
