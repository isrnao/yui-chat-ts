import { useState } from 'react';
import { useResetOnChange } from './useResetOnChange';

/** Retain display data while a browser-owned surface finishes closing. */
export function useRetainedValue<T>(value: T | null): T | null {
  const [retained, setRetained] = useState(value);
  useResetOnChange(value, (next) => {
    if (next !== null) setRetained(next);
  });
  return value ?? retained;
}
