// 要求のヘッダの読み方（save-chat・report-chat・two-shot で同じにする）。import を持たない。

/**
 * 送ってきたクライアント（x-client。Android 版は `android/<版>`）。古い版のアプリを見分けるため、スパンの
 * client.app に記録する（.kiro/specs/android-native-app Task 0.8、R21.7）。無ければ Web とみなす。
 * 値は短い英数字と記号だけを受け取り、ほかは unknown にする（任意の文字列を記録しない）
 */
export function readClient(headers: Headers): string {
  const value = headers.get('x-client')?.trim();
  if (!value) return 'web';
  return /^[a-z]+\/[0-9A-Za-z.+-]{1,32}$/.test(value) ? value : 'unknown';
}

/**
 * 記録のための IP（x-forwarded-for の先頭 → x-real-ip）。先頭はクライアントが自由に付けられるので、記録には使うが、
 * 制限や判定の根拠には使わない（そちらは [createIpResolver]）。
 */
export function resolveObservedIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.headers.get('x-real-ip')?.trim() || '';
}

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const IPV6 = /^[0-9A-Fa-f:.]+$/;

function isIp(value: string): boolean {
  const v4 = IPV4.exec(value);
  if (v4) return v4.slice(1).every((part) => Number(part) <= 255);
  return value.includes(':') && IPV6.test(value) && value.length <= 45;
}

/**
 * 信頼境界を設定した IP の取り出し方を作る（two-shot design.md §7「handler と認証境界」）。
 *
 * x-forwarded-for の先頭はクライアントが自由に付けられるので、判定や制限の根拠には使わない。デプロイ先のプロキシが
 * どのヘッダを上書き・追記するかを確かめたうえで、環境変数（TWO_SHOT_TRUSTED_IP_HEADER・REPORT_TRUSTED_IP_HEADER）に
 * 次のどちらかを設定する。
 *   - `<ヘッダ名>`: プロキシが上書きするヘッダ（例: `x-real-ip`）の値をそのまま使う
 *   - `x-forwarded-for:<n>`: 末尾から n 番目（1 始まり）の値を使う。プロキシが追記した値だけを信じる
 * 未設定・形式が不正なら常に null（IP で判定しない。安全側）。
 */
export function createIpResolver(spec: string | undefined): (req: Request) => string | null {
  const trimmed = spec?.trim().toLowerCase() ?? '';
  if (trimmed === '') return () => null;
  const forwarded = /^x-forwarded-for:(\d+)$/.exec(trimmed);
  if (forwarded) {
    const fromEnd = Number(forwarded[1]);
    if (fromEnd < 1) return () => null;
    return (req) => {
      const hops = (req.headers.get('x-forwarded-for') ?? '')
        .split(',')
        .map((hop) => hop.trim())
        .filter((hop) => hop !== '');
      const value = hops[hops.length - fromEnd];
      return value !== undefined && isIp(value) ? value : null;
    };
  }
  if (!/^[a-z0-9-]+$/.test(trimmed)) return () => null;
  return (req) => {
    const value = req.headers.get(trimmed)?.trim() ?? '';
    return isIp(value) ? value : null;
  };
}
