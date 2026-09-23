import { createPersistentStore } from '@shared/utils/persistentStore';
import type { AvatarId } from '@features/chat/types';

const STORAGE_KEY = 'yui-chat-settings';
const SESSION_VISIT_KEY = 'yui-chat-visit-counted';

export type UserSettings = {
  name: string;
  color: string;
  email: string;
  windowRows: number;
  avatar: AvatarId;
  visitCount: number;
  lastLogin: number; // Unix timestamp ms（今回のログイン時刻）
  previousLogin: number; // Unix timestamp ms（前回のログイン時刻 / レガシーの LAST LOGIN 表示用）
};

export const DEFAULT_SETTINGS: UserSettings = {
  name: '',
  color: '#ff69b4',
  email: '',
  windowRows: 30,
  avatar: 'none',
  visitCount: 0,
  lastLogin: 0,
  previousLogin: 0,
};

function mergeWithDefaults(parsed: Record<string, unknown>): UserSettings {
  return {
    name: typeof parsed.name === 'string' ? parsed.name : DEFAULT_SETTINGS.name,
    color: typeof parsed.color === 'string' ? parsed.color : DEFAULT_SETTINGS.color,
    email: typeof parsed.email === 'string' ? parsed.email : DEFAULT_SETTINGS.email,
    windowRows:
      typeof parsed.windowRows === 'number' && Number.isFinite(parsed.windowRows)
        ? parsed.windowRows
        : DEFAULT_SETTINGS.windowRows,
    avatar: isValidAvatar(parsed.avatar) ? parsed.avatar : DEFAULT_SETTINGS.avatar,
    visitCount:
      typeof parsed.visitCount === 'number' && Number.isFinite(parsed.visitCount)
        ? parsed.visitCount
        : DEFAULT_SETTINGS.visitCount,
    lastLogin:
      typeof parsed.lastLogin === 'number' && Number.isFinite(parsed.lastLogin)
        ? parsed.lastLogin
        : DEFAULT_SETTINGS.lastLogin,
    previousLogin:
      typeof parsed.previousLogin === 'number' && Number.isFinite(parsed.previousLogin)
        ? parsed.previousLogin
        : DEFAULT_SETTINGS.previousLogin,
  };
}

function isValidAvatar(value: unknown): value is AvatarId {
  if (typeof value !== 'string') return false;
  const valid: readonly string[] = [
    'none',
    'hoshi1',
    'hoshi2',
    'hoshi3',
    'hoshi4',
    'hoshi5',
    'hoshi6',
    'hoshi7',
    'hoshi8',
    'miko1',
    'tuki1',
    'tuki2',
    'tuki3',
    'tuki4',
  ];
  return valid.includes(value);
}

/**
 * 利用者の設定。localStorage の値を Persistent_Store で読み書きする
 * （.kiro/specs/react-2026-refactoring Requirement 9）。
 */
const store = createPersistentStore<UserSettings>({
  key: STORAGE_KEY,
  defaults: DEFAULT_SETTINGS,
  parse: (value) =>
    typeof value === 'object' && value !== null
      ? mergeWithDefaults(value as Record<string, unknown>)
      : { ...DEFAULT_SETTINGS },
});

// --- useSyncExternalStore 用インターフェース ---

export const getSnapshot = store.getSnapshot;
export const getServerSnapshot = store.getServerSnapshot;
export const subscribe = store.subscribe;

export function updateSettings(partial: Partial<UserSettings>): void {
  store.update((current) => ({ ...current, ...partial }));
}

// --- 訪問カウント（セッション単位で1回のみ） ---

export function recordVisitOncePerSession(now?: number): void {
  try {
    if (sessionStorage.getItem(SESSION_VISIT_KEY)) return;
    sessionStorage.setItem(SESSION_VISIT_KEY, '1');
  } catch {
    // sessionStorage 無効 → 加算をスキップ（二重加算より安全）
    return;
  }

  store.update((current) => ({
    ...current,
    visitCount: current.visitCount + 1,
    // 直前のログイン時刻を退避してから今回の時刻で更新する（LAST LOGIN 表示用）
    previousLogin: current.lastLogin,
    lastLogin: now ?? Date.now(),
  }));
}
