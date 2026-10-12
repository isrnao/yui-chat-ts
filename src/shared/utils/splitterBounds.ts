/** バー厚を除いた空間で、逆転しないpaneの境界を共通化する。 */
export function splitterBounds(height: number, bar: number, minTop: number, minBottom: number) {
  const available = Math.max(0, height - bar);
  const min = Math.min(minTop, available / 2);
  const max = available - Math.min(minBottom, available / 2);
  return { available, min, max };
}
