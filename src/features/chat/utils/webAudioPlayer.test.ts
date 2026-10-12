import { afterEach, expect, it, vi } from 'vitest';
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.resetModules();
});
it('unlook/mute後にdecodeが完了しても古い音を開始しない', async () => {
  vi.resetModules();
  const source = { buffer: null, connect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null };
  let decode!: (buffer: object) => void;
  class Context {
    state = 'running';
    destination = {};
    addEventListener() {}
    resume() {
      return Promise.resolve();
    }
    createBufferSource() {
      return source;
    }
    decodeAudioData() {
      return new Promise((resolve) => {
        decode = resolve;
      });
    }
  }
  vi.stubGlobal('AudioContext', Context);
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(1)) })
  );
  const player = await import('./webAudioPlayer');
  const sound = player.playNotificationSound();
  await vi.waitFor(() => expect(decode).toBeTypeOf('function'));
  player.stopNotificationSound();
  decode({});
  await sound;
  expect(source.start).not.toHaveBeenCalled();
  player.setAudioMuted(true);
  await player.playNotificationSound();
  expect(source.start).not.toHaveBeenCalled();
});

it('resumeが未解決でも時間上限後に有効化操作へ戻れる', async () => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  class Context {
    state = 'suspended';
    addEventListener() {}
    resume() {
      return new Promise<void>(() => {});
    }
  }
  vi.stubGlobal('AudioContext', Context);
  const player = await import('./webAudioPlayer');
  const unlock = player.unlockAudio();
  await vi.advanceTimersByTimeAsync(player.AUDIO_UNLOCK_TIMEOUT_MS);
  await expect(unlock).resolves.toBeUndefined();
  expect(player.isAudioUnlocked()).toBe(false);
});
