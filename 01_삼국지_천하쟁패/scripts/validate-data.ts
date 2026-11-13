import { loadGameData } from '../src/data/gameData';
import { checkConsistency } from '../src/data/validate';

try {
  const data = loadGameData();
  const errors = checkConsistency(data);
  console.log(`무장 ${data.officers.length}명, 도시 ${data.cities.length}개, 시나리오 ${data.scenarios.length}개`);
  if (errors.length) {
    console.error(`데이터 오류 ${errors.length}건:`);
    for (const e of errors) console.error(' - ' + e);
    process.exit(1);
  }
  console.log('데이터 검증 통과');
} catch (e) {
  console.error('데이터 형식 오류:', e);
  process.exit(1);
}
