#!/usr/bin/env python3
"""ファビコン（透明背景 + 黒のギリシャ文字 ρ）を生成する。

    python3 tools/make_favicon.py

出力:
    favicon.svg           ベクタ。対応ブラウザではこれが使われる
    favicon.ico           16 / 32 / 48 px を格納したレガシー用
    apple-touch-icon.png  180px

SVG はフォントのアウトラインを抜き出してパス化しているため、
閲覧環境にフォントが無くても同じ字形で表示される。
"""

import os

from PIL import Image, ImageDraw, ImageFont
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont

FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
RHO = "ρ"
COLOR = "#000000"
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.dirname(HERE)

CANVAS = 64          # SVG の viewBox
PAD_RATIO = 0.07     # 余白の割合（グリフが縁に触れないように）
ICO_SIZES = [16, 32, 48]
APPLE_SIZE = 180
SUPERSAMPLE = 1600   # PNG はこの解像度で描いてから縮小する


def build_svg() -> str:
    """フォントから ρ のアウトラインを取り出し、中央寄せした SVG を返す。"""
    font = TTFont(FONT)
    glyph_set = font.getGlyphSet()
    glyph_name = font.getBestCmap()[ord(RHO)]

    bounds = BoundsPen(glyph_set)
    glyph_set[glyph_name].draw(bounds)
    x_min, y_min, x_max, y_max = bounds.bounds

    path_pen = SVGPathPen(glyph_set)
    glyph_set[glyph_name].draw(path_pen)
    d = path_pen.getCommands()

    pad = CANVAS * PAD_RATIO
    inner = CANVAS - 2 * pad
    scale = min(inner / (x_max - x_min), inner / (y_max - y_min))

    # フォント座標は y 上向き、SVG は y 下向きなので scale(1, -1) で反転する
    tx = pad + (inner - (x_max - x_min) * scale) / 2 - x_min * scale
    ty = pad + (inner - (y_max - y_min) * scale) / 2 + y_max * scale

    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {CANVAS} {CANVAS}">\n'
        f"  <!-- 透明背景 + 黒のギリシャ文字 ρ -->\n"
        f'  <path transform="translate({tx:.3f} {ty:.3f}) scale({scale:.6f} -{scale:.6f})"\n'
        f'        fill="{COLOR}" d="{d}"/>\n'
        f"</svg>\n"
    )


def render_ink() -> Image.Image:
    """ρ を高解像度で描き、余白を切り詰めた RGBA 画像を返す。"""
    font = ImageFont.truetype(FONT, SUPERSAMPLE)
    canvas = Image.new("RGBA", (SUPERSAMPLE * 2, SUPERSAMPLE * 2), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    draw.text((SUPERSAMPLE // 2, SUPERSAMPLE // 2), RHO, font=font, fill=COLOR)
    return canvas.crop(canvas.getbbox())


def fit(ink: Image.Image, size: int) -> Image.Image:
    """ink を size×size の透明キャンバスに中央寄せで収める。"""
    pad = max(1, round(size * PAD_RATIO))
    inner = size - 2 * pad
    scale = min(inner / ink.width, inner / ink.height)
    w, h = max(1, round(ink.width * scale)), max(1, round(ink.height * scale))

    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(ink.resize((w, h), Image.LANCZOS), ((size - w) // 2, (size - h) // 2))
    return out


def main() -> None:
    svg_path = os.path.join(OUT, "favicon.svg")
    with open(svg_path, "w", encoding="utf-8") as f:
        f.write(build_svg())
    print(f"favicon.svg ({os.path.getsize(svg_path)} B)")

    ink = render_ink()
    print(f"グリフ実寸: {ink.width}x{ink.height} (縦横比 {ink.height / ink.width:.3f})")

    icons = [fit(ink, s) for s in ICO_SIZES]
    ico_path = os.path.join(OUT, "favicon.ico")
    icons[-1].save(
        ico_path,
        format="ICO",
        sizes=[(s, s) for s in ICO_SIZES],
        append_images=icons[:-1],
    )
    print(f"favicon.ico ({', '.join(f'{s}x{s}' for s in ICO_SIZES)}, "
          f"{os.path.getsize(ico_path)} B)")

    apple_path = os.path.join(OUT, "apple-touch-icon.png")
    fit(ink, APPLE_SIZE).save(apple_path)
    print(f"apple-touch-icon.png ({APPLE_SIZE}x{APPLE_SIZE}, "
          f"{os.path.getsize(apple_path)} B)")


if __name__ == "__main__":
    main()
