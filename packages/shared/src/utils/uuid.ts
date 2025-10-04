import { v4 as uuidv4, v7 as uuidv7 } from 'uuid';

/**
 * Generate a privacy-aware UUID v7. Adds a small random time offset so that
 * the original client timestamp cannot be inferred precisely from the id.
 */
export function generateSecureUUIDv7(): string {
  try {
    const offset = Math.random() * 30_000; // up to 30 seconds jitter
    const adjustedTime = Date.now() + offset;
    return uuidv7({ msecs: adjustedTime });
  } catch (error) {
    console.warn('generateSecureUUIDv7: fallback to uuidv4', error);
    return uuidv4();
  }
}

/**
 * Backwards compatible helper used by legacy chat components.
 */
export function generateChatId(): string {
  return generateSecureUUIDv7();
}

export function isUUIDv7(id: string): boolean {
  return typeof id === 'string' && id.length === 36 && id.charAt(14) === '7';
}

export function extractTimestampFromUUIDv7(id: string): number | null {
  if (!isUUIDv7(id)) {
    return null;
  }
  try {
    const timestampHex = id.replace(/-/g, '').slice(0, 12);
    return parseInt(timestampHex, 16);
  } catch (error) {
    console.warn('extractTimestampFromUUIDv7 failed', error);
    return null;
  }
}

export function sortChatsByTime<T extends { uuid: string; time: number }>(chats: T[]): T[] {
  return [...chats].sort((a, b) => {
    if (isUUIDv7(a.uuid) && isUUIDv7(b.uuid)) {
      return b.uuid.localeCompare(a.uuid);
    }
    return b.time - a.time;
  });
}

export function generateUUIDv7FromTimestamp(timestamp: number): string {
  try {
    return uuidv7({ msecs: timestamp });
  } catch (error) {
    console.warn('generateUUIDv7FromTimestamp: fallback to current time', error);
    return uuidv7();
  }
}

export function generateUUIDv7Range(startTime: number, endTime?: number): { start: string; end: string } {
  const end = endTime ?? Date.now();
  return {
    start: generateUUIDv7FromTimestamp(startTime),
    end: generateUUIDv7FromTimestamp(end),
  };
}

export function benchmarkUUIDGeneration(iterations = 10_000) {
  console.time('uuidv7');
  for (let i = 0; i < iterations; i += 1) {
    generateSecureUUIDv7();
  }
  console.timeEnd('uuidv7');

  console.time('uuidv4');
  for (let i = 0; i < iterations; i += 1) {
    uuidv4();
  }
  console.timeEnd('uuidv4');
}
