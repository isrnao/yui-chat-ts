import type { AvatarId } from '@features/chat/types';

const STORAGE_KEY = 'yui-chat-settings';
const SETTINGS_CHANGE_EVENT = 'yui-chat-settings-change';
const SESSION_VISIT_KEY = 'yui-chat-visit-counted';

export type UserSettings = {
  name: string;
  color: string;
  email: string;
  windowRows: number;
  avatar: AvatarId;
  visitCount: number;
  lastLogin: number; // Unix timestamp ms
};

export const DEFAULT_SETTINGS: UserSettings = {
  name: '',
  color: '#ff69b4',
  email: '',
  windowRows: 30,
  avatar: 'none',
  visitCount: 0,
  lastLogin: 0,
};

// メモリ内キャッシュ（localStorage が使えない場合のフォールバック兼高速アクセス用）
let cachedSettings: UserSettings = loadFromStorage();

function loadFromStorage(): UserSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw == null) return { ...DEFAULT_SETTINGS };
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed == null) return { ...DEFAULT_SETTINGS };
    return mergeWithDefaults(parsed as Record<string, unknown>);
  } catch {
    // JSON解析失敗・localStorage無効 → デフォルト値にフォールバック
    return { ...DEFAULT_SETTINGS };
  }
}

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

function saveToStorage(settings: UserSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // QuotaExceededError や localStorage 無効 → サイレントに無視
  }
}

// --- useSyncExternalStore 用インターフェース ---

export function getSnapshot(): UserSettings {
  return cachedSettings;
}

export function getServerSnapshot(): UserSettings {
  return DEFAULT_SETTINGS;
}

export function subscribe(callback: () => void): () => void {
  // 同一タブ内のカスタムイベント
  const handleSettingsChange = () => {
    cachedSettings = loadFromStorage();
    callback();
  };

  // クロスタブの storage イベント
  const handleStorageChange = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY || e.key === null) {
      cachedSettings = loadFromStorage();
      callback();
    }
  };

  window.addEventListener(SETTINGS_CHANGE_EVENT, handleSettingsChange);
  window.addEventListener('storage', handleStorageChange);

  return () => {
    window.removeEventListener(SETTINGS_CHANGE_EVENT, handleSettingsChange);
    window.removeEventListener('storage', handleStorageChange);
  };
}

export function updateSettings(partial: Partial<UserSettings>): void {
  const current = loadFromStorage();
  const next: UserSettings = { ...current, ...partial };
  saveToStorage(next);
  cachedSettings = next;
  window.dispatchEvent(new Event(SETTINGS_CHANGE_EVENT));
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

  const current = loadFromStorage();
  const next: UserSettings = {
    ...current,
    visitCount: current.visitCount + 1,
    lastLogin: now ?? Date.now(),
  };
  saveToStorage(next);
  cachedSettings = next;
  window.dispatchEvent(new Event(SETTINGS_CHANGE_EVENT));
}
