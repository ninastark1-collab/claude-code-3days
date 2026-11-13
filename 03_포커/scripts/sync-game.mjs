// src/game 의 규칙 파일을 Edge Function 폴더로 복사 (서버와 화면이 같은 규칙을 쓰도록)
import { cpSync, mkdirSync, readdirSync } from 'node:fs';
const from = new URL('../src/game/', import.meta.url);
const to = new URL('../supabase/functions/poker/game/', import.meta.url);
mkdirSync(to, { recursive: true });
for (const f of readdirSync(from)) if (f.endsWith('.js') && f !== 'handGuide.js') cpSync(new URL(f, from), new URL(f, to));
console.log('copied game rules → supabase/functions/poker/game/');
