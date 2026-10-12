/**
 * Tailwind の色の名前（`text-pink-500` など）を sRGB の 16 進にする。Tailwind v4 の theme.css は oklch で色を持つので、
 * OKLab の式で sRGB に直し、範囲の外は切り詰める（ブラウザと同じく、ガマットの外は最も近い値になる）。
 * Android 版はこの値で描く（手で写さない）。
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

let palette: Map<string, string> | null = null;

function readPalette(): Map<string, string> {
  if (palette) return palette;
  const css = readFileSync(require.resolve('tailwindcss/theme.css'), 'utf8');
  palette = new Map();
  for (const match of css.matchAll(/--color-([a-z]+-\d+):\s*([^;]+);/g)) {
    palette.set(match[1]!, match[2]!.trim());
  }
  return palette;
}

function oklchToHex(value: string): string {
  const match = value.match(/^oklch\(([\d.]+)%\s+([\d.]+)\s+([\d.]+)\)$/);
  if (!match) throw new Error(`oklch ではない: ${value}`);
  const l = Number(match[1]) / 100;
  const c = Number(match[2]);
  const h = (Number(match[3]) * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
  return `#${linear
    .map((x) => {
      const clipped = Math.min(1, Math.max(0, x));
      const srgb = clipped <= 0.0031308 ? 12.92 * clipped : 1.055 * clipped ** (1 / 2.4) - 0.055;
      return Math.round(srgb * 255)
        .toString(16)
        .padStart(2, '0');
    })
    .join('')}`;
}

/** `text-pink-500`・`marker:text-pink-500`・`pink-500` のどれでも、その色の 16 進 */
export function tailwindHex(className: string): string {
  const name = className.replace(/^.*:/, '').replace(/^(text|bg|border)-/, '');
  const value = readPalette().get(name);
  if (!value) throw new Error(`Tailwind の色が無い: ${className}`);
  return oklchToHex(value);
}
