#!/usr/bin/env bash
# 플레이테스트용 고정 빌드 만들기. 개발 세션이 소스를 고쳐도 테스트 중인 화면이 바뀌지 않게 한다.
# 사용: bash qa/scripts/snapshot-build.sh
# 스냅숏은 프로젝트 밖(%LOCALAPPDATA%\Temp\samgukji-qa\snapshots\<시각>)에 만든다.
#   → 프로젝트 안에 html을 만들면 다른 세션의 개발 서버(HMR)를 건드릴 수 있어서.
# 결과 경로를 qa/snapshots/LATEST.txt 에 적고, .claude/launch.json 의 "qa-build" 가 그 경로를 띄우도록 바꾼다.
set -eu
cd "$(dirname "$0")/../.."
STAMP=$(date +%Y%m%d-%H%M%S)
BASE_DIR="$(cygpath -m "${LOCALAPPDATA:-$TEMP}" 2>/dev/null || echo "${TMPDIR:-/tmp}")/Temp/samgukji-qa/snapshots"
[ -n "${LOCALAPPDATA:-}" ] || BASE_DIR="${TMPDIR:-/tmp}/samgukji-qa/snapshots"
DIR="$BASE_DIR/$STAMP"
mkdir -p "$DIR"
if ! npx vite build --outDir "$DIR" --emptyOutDir; then
  echo
  echo "✖ 빌드 실패. 개발이 '완료'라고 한 빌드라면 이 자체가 S1(진행 불가) 보고 대상이다."
  echo "  개발 중이라면 개발 세션이 파일을 고치는 도중일 수 있으니 잠시 뒤 다시 시도."
  rm -rf "$DIR"
  exit 2
fi
{
  echo "스냅숏 $STAMP"
  echo "버전 $(node -p "require('./package.json').version")"
  echo "최근 수정 소스: $(find src data -type f -printf '%TY-%Tm-%Td %TH:%TM %p\n' 2>/dev/null | sort | tail -1)"
} >"$DIR/SNAPSHOT.txt"
mkdir -p qa/snapshots
echo "$DIR" >qa/snapshots/LATEST.txt
node -e "
const fs=require('fs');const p='.claude/launch.json';const j=JSON.parse(fs.readFileSync(p,'utf8'));
const cfg={name:'qa-build',runtimeExecutable:'npx',runtimeArgs:['vite','preview','--port','5190','--strictPort','--outDir',process.argv[1]],port:5190};
j.configurations=j.configurations.filter(c=>c.name!=='qa-build').concat(cfg);fs.writeFileSync(p,JSON.stringify(j,null,2)+'\n');
" "$DIR"
cat "$DIR/SNAPSHOT.txt"
echo "launch.json qa-build → $DIR (미리보기 도구에서 qa-build 로 시작, 포트 5190)"
