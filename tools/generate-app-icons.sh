#!/bin/bash
# Generates the tvOS layered app icon + top shelf image for The Archive.
# Layers (back to front): background -> border -> letterform "A" + wordmark
# Colors come from ArchiveTheme: background #0a0806, border #2a2218, accent #c8973a
#
# REQUIREMENT: the wordmark renders in Playfair Display, which must be installed
# for macOS to resolve it. The repo ships the file but does not install it, so
# activate it first or the text silently falls back to a generic sans-serif:
#
#   cp TheArchive/Fonts/PlayfairDisplay-Italic.ttf ~/Library/Fonts/
#   ./tools/generate-app-icons.sh <out.brandassets>
#   rm ~/Library/Fonts/PlayfairDisplay-Italic.ttf
#
# The script verifies the font is available and refuses to run without it.
set -euo pipefail

if ! system_profiler SPFontsDataType 2>/dev/null | grep -qi "playfair"; then
  echo "ERROR: Playfair Display is not installed; the wordmark would render in a" >&2
  echo "       fallback font. Install it first (see header comment)." >&2
  exit 1
fi

OUT="${1:?usage: gen_icons.sh <output .brandassets dir>}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

BG="#0a0806"
BORDER="#2a2218"
GOLD="#c8973a"

# Draw the "A" mark: a tall triangle with a notched crossbar, matching the
# existing artwork. Coordinates are in a 0..W x 0..H viewBox so they scale.
mark_svg() { # W H
  local w=$1 h=$2
  # Geometry keyed off the short edge so proportions hold across aspect ratios.
  python3 - "$w" "$h" <<'PY'
import sys
w, h = float(sys.argv[1]), float(sys.argv[2])
cx = w / 2
# The letterform shrinks and rides higher to leave room for the wordmark below.
lh = h * 0.48
top = h * 0.17
bot = top + lh
half = lh * 0.42          # half-width of the splayed legs
stroke = lh * 0.17        # thickness of each leg
# Crossbar sits ~62% down the letter.
bar_y = top + lh * 0.62
bar_h = lh * 0.085
inner = half * 0.30       # half-width of the notch opening

# Outer silhouette: apex -> right foot outer -> right foot inner -> back up -> mirror
outer = (f'M {cx:.2f} {top:.2f} '
         f'L {cx+half:.2f} {bot:.2f} '
         f'L {cx+half-stroke:.2f} {bot:.2f} '
         f'L {cx:.2f} {top+stroke*1.9:.2f} '
         f'L {cx-half+stroke:.2f} {bot:.2f} '
         f'L {cx-half:.2f} {bot:.2f} Z')
# Crossbar spanning the legs, with a notch rising out of its top edge.
# Drawn as one outline so evenodd fill does not cancel the overlap.
bw = half * 0.70          # half-width of the crossbar
bar = (f'M {cx-bw:.2f} {bar_y:.2f} '
       f'L {cx-inner:.2f} {bar_y:.2f} '
       f'L {cx-inner:.2f} {bar_y-bar_h*0.9:.2f} '
       f'L {cx+inner:.2f} {bar_y-bar_h*0.9:.2f} '
       f'L {cx+inner:.2f} {bar_y:.2f} '
       f'L {cx+bw:.2f} {bar_y:.2f} '
       f'L {cx+bw:.2f} {bar_y+bar_h:.2f} '
       f'L {cx-bw:.2f} {bar_y+bar_h:.2f} Z')
# Wordmark sits below the letterform, in the app's own title face.
word_y = bot + h * 0.20
word_size = h * 0.145
print(f'<svg xmlns="http://www.w3.org/2000/svg" width="{w:g}" height="{h:g}" viewBox="0 0 {w:g} {h:g}">')
# Emit each element on a single line so it can be spliced into the flat composite.
# nonzero fill keeps the crossbar union with the legs instead of punching holes.
print(f'  <path fill="#c8973a" fill-rule="nonzero" d="{outer} {bar}"/>')
print(f'  <text x="{cx:.2f}" y="{word_y:.2f}" font-family="Playfair Display" font-style="italic" '
      f'font-size="{word_size:.2f}" fill="#c8973a" text-anchor="middle">The Archive</text>')
print('</svg>')
PY
}

bg_svg() { # W H
  printf '<svg xmlns="http://www.w3.org/2000/svg" width="%s" height="%s"><rect width="%s" height="%s" fill="%s"/></svg>\n' \
    "$1" "$2" "$1" "$2" "$BG"
}

border_svg() { # W H
  local w=$1 h=$2
  # Inset frame, thickness scales with the short edge.
  local t inset
  t=$(python3 -c "print(max(2, round(min($w,$h)*0.018)))")
  inset=$(python3 -c "print(round(min($w,$h)*0.055))")
  python3 - "$w" "$h" "$t" "$inset" "$BORDER" <<'PY'
import sys
w, h, t, inset, col = sys.argv[1:6]
w, h, t, inset = float(w), float(h), float(t), float(inset)
print(f'<svg xmlns="http://www.w3.org/2000/svg" width="{w:g}" height="{h:g}">')
print(f'  <rect x="{inset:g}" y="{inset:g}" width="{w-2*inset:g}" height="{h-2*inset:g}" '
      f'fill="none" stroke="{col}" stroke-width="{t:g}"/>')
print('</svg>')
PY
}

rasterize() { # svgfile out w h
  sips -s format png "$1" --out "$2" >/dev/null 2>&1
  # sips honors the SVG's intrinsic size; assert it landed correctly.
  local got
  got=$(sips -g pixelWidth -g pixelHeight "$2" | awk '/pixelWidth|pixelHeight/{printf "%s", $2}')
  if [ "$got" != "$3$4" ]; then
    echo "ERROR: $2 is ${got}, expected $3x$4" >&2
    exit 1
  fi
}

# Build one .imagestack with three layers at 1x and 2x.
make_stack() { # stackdir W H
  local dir="$1" w=$2 h=$3
  rm -rf "$dir"; mkdir -p "$dir"
  cat > "$dir/Contents.json" <<'JSON'
{
  "info" : { "author" : "xcode", "version" : 1 },
  "layers" : [
    { "filename" : "Mark.imagestacklayer" },
    { "filename" : "Border.imagestacklayer" },
    { "filename" : "Background.imagestacklayer" }
  ]
}
JSON
  local w2=$((w*2)) h2=$((h*2))
  for layer in Background Border Mark; do
    local ldir="$dir/$layer.imagestacklayer"
    mkdir -p "$ldir/Content.imageset"
    printf '{\n  "info" : { "author" : "xcode", "version" : 1 }\n}\n' > "$ldir/Contents.json"
    case $layer in
      Background) bg_svg     "$w"  "$h"  > "$TMP/l.svg"; bg_svg     "$w2" "$h2" > "$TMP/l2.svg" ;;
      Border)     border_svg "$w"  "$h"  > "$TMP/l.svg"; border_svg "$w2" "$h2" > "$TMP/l2.svg" ;;
      Mark)       mark_svg   "$w"  "$h"  > "$TMP/l.svg"; mark_svg   "$w2" "$h2" > "$TMP/l2.svg" ;;
    esac
    rasterize "$TMP/l.svg"  "$ldir/Content.imageset/Content.png"    "$w"  "$h"
    rasterize "$TMP/l2.svg" "$ldir/Content.imageset/Content@2x.png" "$w2" "$h2"
    cat > "$ldir/Content.imageset/Contents.json" <<'JSON'
{
  "images" : [
    { "filename" : "Content.png", "idiom" : "tv", "scale" : "1x" },
    { "filename" : "Content@2x.png", "idiom" : "tv", "scale" : "2x" }
  ],
  "info" : { "author" : "xcode", "version" : 1 }
}
JSON
  done
}

# Flat imageset (top shelf is not layered).
make_imageset() { # dir W H
  local dir="$1" w=$2 h=$3
  rm -rf "$dir"; mkdir -p "$dir"
  local w2=$((w*2)) h2=$((h*2))
  for spec in "$w $h Content.png" "$w2 $h2 Content@2x.png"; do
    set -- $spec
    # Compose background + border + mark into one flat SVG.
    { bg_svg "$1" "$2" | sed 's|</svg>||'
      border_svg "$1" "$2" | sed -n 's|.*\(<rect x=.*/>\).*|  \1|p'
      mark_svg "$1" "$2" | sed -n -e 's|.*\(<path .*/>\).*|  \1|p' -e 's|.*\(<text .*</text>\).*|  \1|p'
      echo '</svg>'
    } > "$TMP/composite.svg"
    # Guard: a failed splice would silently yield an icon missing an element.
    grep -q '<path ' "$TMP/composite.svg" || { echo "ERROR: mark path missing from composite" >&2; exit 1; }
    grep -q '<rect x=' "$TMP/composite.svg" || { echo "ERROR: border missing from composite" >&2; exit 1; }
    grep -q '<text ' "$TMP/composite.svg" || { echo "ERROR: wordmark missing from composite" >&2; exit 1; }
    rasterize "$TMP/composite.svg" "$dir/$3" "$1" "$2"
  done
  cat > "$dir/Contents.json" <<'JSON'
{
  "images" : [
    { "filename" : "Content.png", "idiom" : "tv", "scale" : "1x" },
    { "filename" : "Content@2x.png", "idiom" : "tv", "scale" : "2x" }
  ],
  "info" : { "author" : "xcode", "version" : 1 }
}
JSON
}

mkdir -p "$OUT"
make_stack    "$OUT/App Icon - Small.imagestack"  400  240
make_stack    "$OUT/App Icon - Large.imagestack" 1280  768
make_imageset "$OUT/Top Shelf Image Wide.imageset" 1920 720

cat > "$OUT/Contents.json" <<'JSON'
{
  "assets" : [
    {
      "filename" : "App Icon - Small.imagestack",
      "idiom" : "tv",
      "role" : "primary-app-icon",
      "size" : "400x240"
    },
    {
      "filename" : "App Icon - Large.imagestack",
      "idiom" : "tv",
      "role" : "primary-app-icon",
      "size" : "1280x768"
    },
    {
      "filename" : "Top Shelf Image Wide.imageset",
      "idiom" : "tv",
      "role" : "top-shelf-image-wide",
      "size" : "1920x720"
    }
  ],
  "info" : { "author" : "xcode", "version" : 1 }
}
JSON

echo "Generated layered icon set at: $OUT"
