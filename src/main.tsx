import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './App.css';
import App from './App';
import { recordVisitOncePerSession } from '@features/chat/utils/settingsStore';
import { prefetchClientIP } from '@shared/utils/clientInfo';

// React ライフサイクルの影響を受けない位置で1回だけ呼び出す
recordVisitOncePerSession();

// クライアントIPを先行取得（入室・発言時の待ち時間を削減）
prefetchClientIP();

const root = createRoot(document.getElementById('root')!);

root.render(
  <StrictMode>
    <App />
  </StrictMode>
);
