import { lazy, Suspense } from 'react';
import { BattleScreen } from './screens/Battle';
import { LordScreen, ScenarioScreen } from './screens/NewGame';
import { SettingsScreen } from './screens/Settings';
import { EndingScreen, StrategyScreen } from './screens/Strategy';
import { TitleScreen } from './screens/Title';
import { useStore } from './store';

/** 3D 화면은 three.js 를 쓰므로 필요할 때만 불러온다 */
const Preview3D = lazy(() => import('./render3d/Preview3D'));

export function App() {
  const screen = useStore((s) => s.screen);
  const overlay = useStore((s) => s.overlay);
  const toasts = useStore((s) => s.toasts);
  return (
    <>
      {screen === 'title' && <TitleScreen />}
      {screen === 'newgame' && <ScenarioScreen />}
      {screen === 'lord' && <LordScreen />}
      {screen === 'strategy' && <StrategyScreen />}
      {screen === 'battle' && <BattleScreen />}
      {screen === 'ending' && <EndingScreen />}
      {screen === 'scene3d' && (
        <Suspense fallback={<div className="screen" />}>
          <Preview3D />
        </Suspense>
      )}
      {screen !== 'strategy' && overlay?.kind === 'settings' && <SettingsScreen />}
      <div className="toasts" role="status">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.ok ? '' : 'ng'}`}>
            {t.text}
          </div>
        ))}
      </div>
    </>
  );
}
