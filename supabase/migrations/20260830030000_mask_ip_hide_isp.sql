-- マスクの粒度を変更し、ISP と地域が判らないようにする。
--
-- 背景:
--   20260830020000 の mask_ip() は IPv4 の末尾オクテットだけを伏せていた（203.0.113.*）。
--   しかし ISP への割り当ては /16〜/13 規模で行われるため、第2・第3オクテットが残っていると
--   whois で ISP が確定し、GeoIP で都市レベルの地域まで絞れてしまう。末尾 1 オクテットだけの
--   マスクでは「生 IP を出さない」以上の保護にならなかった。
--
--   割り当てブロックを特定するのは第2・第3オクテットなので、そこを伏せる。
--   残る第1オクテットは RIR 割り当て（133/8 なら日本）程度の情報しか持たない。
--   末尾は残すが、ネットワーク部が判らなければホストには到達できないため、
--   居場所の特定には使えない（弱い識別子としてのみ機能する）。
--
--     203.0.113.9      →  203.*.*.9
--
--   IPv6 は末尾を残さない。SLAAC の EUI-64 では末尾ブロックが MAC アドレス由来で
--   回線をまたいでも不変なため、ネットワーク部を伏せても同一端末だと判ってしまう。
--   ISP 割り当ては /29〜/32 なので、先頭 1 ブロックだけを残す。
--
--     2001:db8:1234:5678::1  →  2001:*
--
-- ip_masked は生成列なので、関数を差し替えても既存行は再計算されない。
-- 末尾で UPDATE を流して全行を作り直す。

CREATE OR REPLACE FUNCTION public.mask_ip(p_ip text) RETURNS text
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  b bytea;
BEGIN
  IF p_ip IS NULL OR p_ip = '' THEN
    RETURN '';
  END IF;

  -- IPv4: 第2・第3オクテットを伏せる（割り当てブロックを特定する部分）
  IF p_ip ~ '^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$' THEN
    RETURN regexp_replace(p_ip, '^(\d{1,3})\.\d{1,3}\.\d{1,3}\.(\d{1,3})$', '\1.*.*.\2');
  END IF;

  -- IPv6: 16進とコロンのみを対象にし、先頭 16bit だけ残す。
  -- inet へのキャストで表記を正規化し、不正な値は下の EXCEPTION で '*' に倒す。
  IF p_ip ~ '^[0-9a-fA-F:]+$' THEN
    b := substring(inet_send(p_ip::inet) FROM 5 FOR 2);
    IF b IS NOT NULL AND length(b) = 2 THEN
      RETURN to_hex(get_byte(b, 0) * 256 + get_byte(b, 1)) || ':*';
    END IF;
  END IF;

  RETURN '*';
EXCEPTION
  WHEN others THEN
    RETURN '*';
END;
$$;

COMMENT ON FUNCTION public.mask_ip(text) IS
  '表示用に IP を伏せる。chats.ip_masked 生成列の式。IPv4 は第2・第3オクテット、IPv6 は先頭16bitより後ろを伏せる。';

-- 適用時の自己検証。壊れていればここで止まる。
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT * FROM (VALUES
      ('219.107.106.253',                        '219.*.*.253'),
      ('203.0.113.9',                            '203.*.*.9'),
      ('133.32.132.214',                         '133.*.*.214'),
      ('2001:0db8:1234:5678:9abc:def0:1234:5678','2001:*'),
      ('2001::dead:beef',                        '2001:*'),
      ('2400:4050::1',                           '2400:*'),
      ('::1',                                    '0:*'),
      ('::ffff:192.0.2.1',                       '*'),
      ('1:2:3:4:5:6:7:8:9',                      '*'),
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

-- 生成列は書き込み時にしか評価されないため、既存行を明示的に作り直す。
-- chats は supabase_realtime publication に入っているので UPDATE イベントが WAL に流れるが、
-- クライアントの購読は INSERT 限定のため配信されない。
UPDATE public.chats SET ip = ip WHERE ip <> '';
