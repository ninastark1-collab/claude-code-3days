import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { installPlatform, installWebApp, onBackButton } from './platform';
import { App } from './ui/App';
import { ErrorBoundary, installGlobalErrorHandlers } from './ui/ErrorScreen';
import { startBgmDirector } from './audio/director';
import { applySettings } from './ui/settings';
import { handleBack, installSuspendSave } from './ui/store';
import { Viewport } from './ui/viewport';
import './ui/fonts.css';
import './ui/tokens.css';
import './ui/style.css';

installGlobalErrorHandlers();
installPlatform();
installWebApp();
applySettings();
startBgmDirector();
installSuspendSave();
onBackButton(handleBack);

// 개발 모드에서만: 브라우저 콘솔에서 상태를 들여다보는 디버그 핸들 (설치판에는 들어가지 않음)
if (import.meta.env.DEV) {
  void import('./ui/store').then((m) => ((window as unknown as { __store: unknown }).__store = m.useStore));
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Viewport>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </Viewport>
  </StrictMode>,
);
