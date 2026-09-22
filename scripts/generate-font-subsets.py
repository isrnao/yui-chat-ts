#!/usr/bin/env python3
"""
DotGothic16 を unicode-range 単位のサブセットへ分割する。

背景:
  分割前は 480KB の woff2 を 1 ファイルで配信しており、トップページの転送量の
  約 74% を占めていた。unicode-range を付けて分割すると、ブラウザは実際に描画へ
  必要な範囲のサブセットだけを取得する。

  チャット本文はユーザー入力のため「文字を削るサブセット化」は不可。合計の
  文字集合は分割前と一致させ、必要な範囲だけ落とす形にする。

区分:
  1. Google Fonts が DotGothic16 に対して公開している unicode-range 分割
     (123 サブセット、出現頻度ベース) をそのまま使う。ユーザー入力の任意の日本語は
     ここが受け持つ。
  2. さらに「アプリの静的テキストに出る文字だけ」を集めた ui サブセットを生成する。
     トップページの取得が 1 リクエストで済む。
     フォールバック側の unicode-range からは ui の文字を除外し、両者を排他にする。
     CSS Fonts 仕様では unicode-range が重なった場合「後に宣言した @font-face が先に
     照合される」ため、排他にしないと後読みされるフォールバック CSS が UI 文字まで
     奪ってしまい、最適化が無効化される。

  配信は従来どおりセルフホスト。

必要環境:
  python3 -m pip install "fonttools[woff]" brotli

実行:
  python3 scripts/generate-font-subsets.py
"""

from __future__ import annotations

import re
import subprocess
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "tools" / "fonts-src" / "DotGothic16-Regular.woff2"
SRC_DIRS = (ROOT / "src",)
EXTRA_TEXT_FILES = (ROOT / "index.html",)
OUT_DIR = ROOT / "public" / "fonts" / "dotgothic16"
CSS_OUT = ROOT / "src" / "styles" / "fonts.css"
CSS_FALLBACK_OUT = ROOT / "src" / "styles" / "fonts-fallback.css"

GF_URL = "https://fonts.googleapis.com/css2?family=DotGothic16&display=swap"
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0 Safari/537.36"
)

CSS_COMMON = """/*
 * DotGothic16 セルフホストフォント (unicode-range 分割版)。
 *
 * - 16×16 ゴシック体ビットマップ由来のドットフォント (Fontworks)。
 * - Regular (400) のみ。Bold は存在しないため font-weight: 700 でも同じグリフが適用される。
 * - font-display: swap でフォールバック表示を許容する。
 * - ライセンス: SIL Open Font License 1.1 (`/fonts/LICENSE.txt`)
 *
 * このファイルは scripts/generate-font-subsets.py が生成する。直接編集しないこと。
 * 区分は Google Fonts が公開している DotGothic16 の unicode-range 分割に従う
 * (出現頻度ベース)。配信はセルフホストのまま。
 *
 * 分割前は 480KB の単一ファイルを index.html で preload しており、トップページ
 * 転送量の約 74% を占めて JS と帯域を奪っていた。分割後はブラウザが描画に必要な
 * 範囲だけを取得する。合計の文字集合は分割前と一致する。
 */
"""

CSS_HEADER = (
    CSS_COMMON
    + """
/*
 * ここにはアプリの静的テキスト用サブセット (ui) だけを置く。CSS は render-blocking なので、
 * 123 個のフォールバック @font-face を同梱すると CSS 自体が 34kB gz 太り、
 * フォント削減分を打ち消してしまう。フォールバックは fonts-fallback.css に分け、
 * 初回描画後に動的 import する。
 */
"""
)

CSS_FALLBACK_HEADER = (
    CSS_COMMON
    + """
/*
 * ユーザー入力の任意の日本語を受け持つフォールバック群 (Google Fonts の頻度分割)。
 * render-blocking を避けるため、初回描画後に main.tsx から動的 import される。
 * 未ロードの間に稀な文字が現れてもフォールバック表示になるだけで、font-display: swap の
 * 既定挙動と変わらない。
 */
"""
)


def fetch_unicode_ranges() -> list[str]:
    req = urllib.request.Request(GF_URL, headers={"User-Agent": UA})
    with urllib.request.urlopen(req) as res:
        css = res.read().decode("utf-8")
    ranges = re.findall(r"unicode-range:\s*([^;]+);", css)
    if not ranges:
        raise SystemExit("unicode-range を取得できなかった")
    return [r.strip() for r in ranges]


def collect_static_text() -> set[str]:
    """アプリの静的テキストに現れる文字を集める。

    ソース中の非 ASCII 断片をすべて拾う (コメントも含む)。UI に出る語彙より広めに
    取ることで、文言を変更してサブセットを再生成し忘れても Google 分割側が受け持ち、
    表示は壊れない安全側の設計にしている。
    """
    chars: set[str] = set(chr(c) for c in range(0x20, 0x7F))
    files: list[Path] = []
    for directory in SRC_DIRS:
        for pattern in ("*.ts", "*.tsx"):
            files += [
                p
                for p in directory.rglob(pattern)
                if ".test." not in p.name and ".stories." not in p.name
            ]
    files += [p for p in EXTRA_TEXT_FILES if p.exists()]
    for path in files:
        for fragment in re.findall(r"[^\x00-\x7F]+", path.read_text(encoding="utf-8")):
            chars.update(fragment)
    return chars


def to_unicode_range(chars: set[str]) -> str:
    """連続するコードポイントをまとめて unicode-range 文字列にする。"""
    points = sorted(ord(c) for c in chars)
    parts: list[str] = []
    start = prev = points[0]
    for cp in points[1:]:
        if cp == prev + 1:
            prev = cp
            continue
        parts.append(f"U+{start:04X}" if start == prev else f"U+{start:04X}-{prev:04X}")
        start = prev = cp
    parts.append(f"U+{start:04X}" if start == prev else f"U+{start:04X}-{prev:04X}")
    return ", ".join(parts)


def render_face(url: str, unicode_range: str) -> str:
    return (
        "@font-face {\n"
        "  font-family: 'DotGothic16';\n"
        "  font-style: normal;\n"
        "  font-weight: 400;\n"
        "  font-display: swap;\n"
        f"  src: url('{url}') format('woff2');\n"
        f"  unicode-range: {unicode_range};\n"
        "}"
    )


def parse_unicode_range(unicode_range: str) -> list[tuple[int, int]]:
    """"U+3000-30FF, U+FF01" -> [(0x3000, 0x30FF), (0xFF01, 0xFF01)]"""
    spans: list[tuple[int, int]] = []
    for part in unicode_range.split(","):
        token = part.strip().removeprefix("U+")
        if "-" in token:
            start, end = token.split("-")
            spans.append((int(start, 16), int(end, 16)))
        else:
            value = int(token, 16)
            spans.append((value, value))
    return spans


def font_codepoints() -> set[int]:
    from fontTools.ttLib import TTFont

    with TTFont(SRC) as font:
        return set(font.getBestCmap().keys())


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"元フォントが見つからない: {SRC}")

    ranges = fetch_unicode_ranges()
    available = font_codepoints()
    static_chars = collect_static_text()
    static_points = {ord(c) for c in static_chars}
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for stale in OUT_DIR.glob("*.woff2"):
        stale.unlink()

    faces: list[str] = []
    kept = 0
    total = 0
    for index, unicode_range in enumerate(ranges):
        # 元フォントに存在し、かつ ui サブセットが受け持たない文字だけを対象にする
        points = sorted(
            cp
            for a, b in parse_unicode_range(unicode_range)
            for cp in range(a, b + 1)
            if cp in available and cp not in static_points
        )
        if not points:
            continue

        out = OUT_DIR / f"{index}.woff2"
        subprocess.run(
            [
                sys.executable,
                "-m",
                "fontTools.subset",
                str(SRC),
                "--unicodes=" + ",".join(f"{cp:04X}" for cp in points),
                "--flavor=woff2",
                "--layout-features=*",
                f"--output-file={out}",
            ],
            check=True,
            stdout=subprocess.DEVNULL,
        )

        kept += 1
        total += out.stat().st_size
        faces.append(
            render_face(
                f"/fonts/dotgothic16/{index}.woff2",
                to_unicode_range({chr(cp) for cp in points}),
            )
        )

    # Google の分割はフォントの全文字を覆わない (合成記号や一部の数学記号など)。
    # 分割前と文字集合を一致させるため、取りこぼしを rest サブセットで拾う。
    covered = {
        cp
        for face in faces
        for a, b in parse_unicode_range(
            re.search(r"unicode-range: ([^;]+);", face).group(1)
        )
        for cp in range(a, b + 1)
    }
    leftover = sorted(available - covered - static_points)
    if leftover:
        rest_out = OUT_DIR / "rest.woff2"
        subprocess.run(
            [
                sys.executable,
                "-m",
                "fontTools.subset",
                str(SRC),
                "--unicodes=" + ",".join(f"{cp:04X}" for cp in leftover),
                "--flavor=woff2",
                "--layout-features=*",
                f"--output-file={rest_out}",
            ],
            check=True,
            stdout=subprocess.DEVNULL,
        )
        kept += 1
        total += rest_out.stat().st_size
        faces.append(
            render_face(
                "/fonts/dotgothic16/rest.woff2",
                to_unicode_range({chr(cp) for cp in leftover}),
            )
        )

    # アプリ静的テキスト用サブセット。フォールバック側と範囲が排他なので順序に依存しない。
    ui_out = OUT_DIR / "ui.woff2"
    subprocess.run(
        [
            sys.executable,
            "-m",
            "fontTools.subset",
            str(SRC),
            "--text=" + "".join(sorted(static_chars)),
            "--flavor=woff2",
            "--layout-features=*",
            f"--output-file={ui_out}",
        ],
        check=True,
        stdout=subprocess.DEVNULL,
    )
    ui_face = render_face("/fonts/dotgothic16/ui.woff2", to_unicode_range(static_chars))
    ui_size = ui_out.stat().st_size

    CSS_OUT.write_text(CSS_HEADER + "\n" + ui_face + "\n", encoding="utf-8")
    CSS_FALLBACK_OUT.write_text(
        CSS_FALLBACK_HEADER + "\n" + "\n\n".join(faces) + "\n", encoding="utf-8"
    )
    print(f"✔ {kept}/{len(ranges)} フォールバックサブセットを生成 (合計 {total / 1024:.0f}KB)")
    print(f"✔ ui サブセット: {len(static_chars)} 文字 / {ui_size / 1024:.0f}KB")
    print(f"  → {OUT_DIR}")
    print(f"  → {CSS_OUT} (critical)")
    print(f"  → {CSS_FALLBACK_OUT} (deferred)")


if __name__ == "__main__":
    main()
