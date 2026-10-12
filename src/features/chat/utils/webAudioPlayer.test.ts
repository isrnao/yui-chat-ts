import { afterEach, expect, it, vi } from 'vitest';
afterEach(() => {
  vi.unstubAllGlobals();
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
