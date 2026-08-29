-- IPv6 のマスク境界を修正する。
--
-- 20260830000000 のバックフィルは split_part(ip, ':', 1..3) で「先頭3ブロック」を取って
-- いたが、圧縮表記（::）を展開しないため境界がずれる。
--   例: 2001::dead:beef
--       展開すると 2001:0:0:0:0:0:dead:beef なので上位 48bit は 2001:0:0
--       旧実装の出力は 2001::dead:* となり、7ブロック目にあたるホスト側の dead が露出する
--
-- inet に正規化し、先頭 6 バイト（= 48bit）だけを 3 ブロックに組み直す方式へ改める。
-- save-chat Edge Function の maskIpv6() と同じ出力（小文字・先行ゼロなし）になる。
--
-- 20260830000000 は本番へ適用済みのため、そのファイルは書き換えず本マイグレーションで
-- 既存行を再計算する。IPv4 行と ip が空の行は対象外。
--
-- 適用順序（重要）:
--   修正版の save-chat をデプロイしてから本マイグレーションを実行すること。
--   逆順にすると、この UPDATE の後・Edge 再デプロイまでの間に投稿された圧縮表記の
--   IPv6 行が旧ロジックで再び誤マスクされ、以後どこからも再計算されない。
--   すでに逆順で流してしまった場合は、Edge デプロイ後に本ファイルの UPDATE を
--   もう一度実行すればよい（差分がある行だけを更新する冪等な UPDATE）。

-- セッションローカルのヘルパー。不正な値のキャスト失敗を握り潰して '*' に倒す。
-- pg_temp なのでセッション終了時に自動で消える（永続オブジェクトを増やさない）。
CREATE OR REPLACE FUNCTION pg_temp.mask_ipv6(p_ip text) RETURNS text AS $$
DECLARE
  b bytea;
BEGIN
  -- inet_send: 先頭4バイトがヘッダ（family/bits/is_cidr/nb）、以降がアドレス本体
  b := substring(inet_send(p_ip::inet) FROM 5 FOR 6);
  IF b IS NULL OR length(b) < 6 THEN
    RETURN '*';
  END IF;
  RETURN to_hex(get_byte(b, 0) * 256 + get_byte(b, 1)) || ':' ||
         to_hex(get_byte(b, 2) * 256 + get_byte(b, 3)) || ':' ||
         to_hex(get_byte(b, 4) * 256 + get_byte(b, 5)) || ':*';
EXCEPTION
  WHEN others THEN
    RETURN '*';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

UPDATE public.chats
SET ip_masked = pg_temp.mask_ipv6(ip)
WHERE ip LIKE '%:%'
  AND ip_masked IS DISTINCT FROM pg_temp.mask_ipv6(ip);
