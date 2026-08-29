-- ip_masked を生成列に移行し、マスク規則の実装を1つに集約する。
--
-- 背景:
--   これまではマスク値を save-chat Edge Function（TypeScript）が計算して INSERT し、
--   既存行のバックフィルは SQL 側で同じ規則を書き直していた。同じ規則が2実装ある構造
--   のため、IPv6 の圧縮表記・不正表記の扱いで両者の出力が繰り返し食い違った
--   （20260830010000 とその後の修正群）。
--
--   生成列にすると計算主体が Postgres だけになり、食い違いが原理的に発生しない。
--   バックフィルも列追加時に全行が自動計算されるため不要になる。
--
-- 適用順序（重要）:
--   `ip_masked` を送らない版の save-chat を先にデプロイしてから本マイグレーションを
--   適用すること。生成列へ明示的に値を渡す INSERT はエラーになるため、逆順にすると
--   全ての発言投稿が失敗する。
--   先に Edge を出した場合、本マイグレーションまでの間に投稿された行は ip_masked が
--   空になるが、列の作り直し時に全行が再計算されるため自動的に解消する。
--
-- 20260830010000（IPv6 バックフィルの修正）は本マイグレーションが上書きするため、
-- 適用済みかどうかに関わらず結果は同じになる。

-- マスク規則の唯一の実装。
--   IPv4          : 末尾オクテットを伏せる      203.0.113.9      -> 203.0.113.*
--   IPv6          : 上位 48bit だけ残す         2001::dead:beef  -> 2001:0:0:*
--   それ以外・不正: 全伏せ                      ::ffff:192.0.2.1 -> *
-- 生成列の式に使うため IMMUTABLE。入力のみに依存し外部状態を参照しないので成立する。
CREATE OR REPLACE FUNCTION public.mask_ip(p_ip text) RETURNS text
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  b bytea;
BEGIN
  IF p_ip IS NULL OR p_ip = '' THEN
    RETURN '';
  END IF;

  IF p_ip ~ '^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$' THEN
    RETURN regexp_replace(p_ip, '\.\d{1,3}$', '.*');
  END IF;

  -- 16進とコロンのみを IPv6 として扱う。IPv4 射影表記（::ffff:192.0.2.1）は
  -- inet が受理してしまうが、上位 48bit が常にゼロで意味を持たないため弾いて全伏せにする。
  IF p_ip ~ '^[0-9a-fA-F:]+$' THEN
    -- inet_send: 先頭4バイトがヘッダ（family/bits/is_cidr/nb）、以降がアドレス本体。
    -- 不正表記は ::inet のキャストが例外を投げ、下の EXCEPTION で '*' に倒れる。
    b := substring(inet_send(p_ip::inet) FROM 5 FOR 6);
    IF b IS NOT NULL AND length(b) = 6 THEN
      RETURN to_hex(get_byte(b, 0) * 256 + get_byte(b, 1)) || ':' ||
             to_hex(get_byte(b, 2) * 256 + get_byte(b, 3)) || ':' ||
             to_hex(get_byte(b, 4) * 256 + get_byte(b, 5)) || ':*';
    END IF;
  END IF;

  RETURN '*';
EXCEPTION
  WHEN others THEN
    RETURN '*';
END;
$$;

COMMENT ON FUNCTION public.mask_ip(text) IS
  '表示用に IP を伏せる。chats.ip_masked 生成列の式。IPv4 は末尾オクテット、IPv6 は上位48bitのみ保持。';

-- 適用時の自己検証。ここで落ちれば規則が壊れているので、本番へ流す前に気づける。
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT * FROM (VALUES
      ('219.107.106.253',                        '219.107.106.*'),
      ('203.0.113.9',                            '203.0.113.*'),
      ('2001:0db8:1234:5678:9abc:def0:1234:5678','2001:db8:1234:*'),
      ('2001::dead:beef',                        '2001:0:0:*'),
      ('2001:db8::1',                            '2001:db8:0:*'),
      ('::1',                                    '0:0:0:*'),
      ('::',                                     '0:0:0:*'),
      ('1:2:3:4:5:6:7::',                        '1:2:3:*'),
      ('::ffff:192.0.2.1',                       '*'),
      ('1:2:3:4:5:6:7:8::',                      '*'),
      ('1:2:3:4:5:6:7:8:9',                      '*'),
      ('1:2:3',                                  '*'),
      ('unknown-host',                           '*'),
      ('',                                       '')
    ) AS v(input, expected)
  LOOP
    IF public.mask_ip(t.input) IS DISTINCT FROM t.expected THEN
      RAISE EXCEPTION 'mask_ip(%) returned % (expected %)',
        t.input, public.mask_ip(t.input), t.expected;
    END IF;
  END LOOP;
END
$$;

-- 普通の列を落として生成列として作り直す。
-- ADD COLUMN 時に全行が自動計算されるため、バックフィルの UPDATE は不要。
ALTER TABLE public.chats DROP COLUMN "ip_masked";

ALTER TABLE public.chats
    ADD COLUMN "ip_masked" text
        GENERATED ALWAYS AS (public.mask_ip("ip")) STORED NOT NULL;

-- 列を作り直すと列レベル権限も失われるので付け直す（テーブル全体の SELECT は
-- 20260830000000 で REVOKE 済みのため、この GRANT が無いと anon から読めない）。

GRANT SELECT ("ip_masked") ON TABLE public.chats TO "anon", "authenticated";

COMMENT ON COLUMN public.chats.ip_masked IS
  '表示用のマスク済み IP（生成列）。ip から Postgres が自動計算する。UI はこの列だけを参照する。';
