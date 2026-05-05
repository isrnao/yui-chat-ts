// Web Audio API を利用した音声再生モジュール
// lookコマンドの通知音（rin.mp3 / rin.webm）を再生する

let audioContext: AudioContext | null = null;
let audioBuffer: AudioBuffer | null = null;
let currentSource: AudioBufferSourceNode | null = null;
let loadingPromise: Promise<AudioBuffer> | null = null;

// --- フォーマット選択 ---

function selectSoundUrl(): string {
  const base = import.meta.env.BASE_URL;

  // Audio 要素で webm 対応を確認し、対応していれば webm を優先
  try {
    const audio = new Audio();
    if (audio.canPlayType('audio/webm; codecs=opus') !== '') {
      return `${base}sounds/rin.webm`;
    }
  } catch {
    // Audio コンストラクタが使えない環境 → mp3 にフォールバック
  }

  return `${base}sounds/rin.mp3`;
}

// --- AudioContext 管理 ---

function getAudioContext(): AudioContext {
  if (audioContext == null) {
    audioContext = new AudioContext();
  }
  return audioContext;
}

async function loadAudioBuffer(): Promise<AudioBuffer> {
  if (audioBuffer != null) return audioBuffer;

  // 同時に複数回呼ばれても1回だけフェッチする
  if (loadingPromise != null) return loadingPromise;

  loadingPromise = (async () => {
    const ctx = getAudioContext();
    const url = selectSoundUrl();
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const decoded = await ctx.decodeAudioData(arrayBuffer);
    audioBuffer = decoded;
    return decoded;
  })();

  try {
    return await loadingPromise;
  } catch (err) {
    // 次回リトライできるようにリセット
    loadingPromise = null;
    throw err;
  }
}

// --- 公開 API ---

/**
 * 通知音を再生する。
 * AudioBufferSourceNode は再利用不可のため、再生ごとに新規作成する。
 * エラーはキャッチしてログ出力のみ行い、チャット機能を妨げない。
 */
export async function playNotificationSound(): Promise<void> {
  try {
    const ctx = getAudioContext();
    // ユーザーインタラクション内で呼ばれた場合、suspended な AudioContext を自動的に resume する
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    const buffer = await loadAudioBuffer();

    // 前回の再生を停止してから新しい再生を開始
    stopNotificationSound();

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.onended = () => {
      if (currentSource === source) {
        currentSource = null;
      }
    };
    source.start(0);
    currentSource = source;
  } catch (err) {
    console.warn('[webAudioPlayer] 通知音の再生に失敗しました:', err);
  }
}

/**
 * 現在再生中の通知音を停止する。
 * 再生中でない場合は何もしない。
 */
export function stopNotificationSound(): void {
  if (currentSource != null) {
    try {
      currentSource.stop();
    } catch {
      // すでに停止済みの場合は InvalidStateError が出るが無視
    }
    currentSource = null;
  }
}

/**
 * AudioContext がユーザーインタラクションにより有効化（resume）されているかを返す。
 * AudioContext が未作成の場合は false を返す。
 */
export function isAudioUnlocked(): boolean {
  return audioContext != null && audioContext.state === 'running';
}

/**
 * AudioContext.resume() を呼び出して音声再生を有効化する。
 * ブラウザの自動再生ポリシーにより、ユーザーインタラクション内で呼ぶ必要がある。
 * エラーはキャッチしてログ出力のみ行う。
 */
export async function unlockAudio(): Promise<void> {
  try {
    const ctx = getAudioContext();
    await ctx.resume();
  } catch (err) {
    console.warn('[webAudioPlayer] AudioContext の有効化に失敗しました:', err);
  }
}
