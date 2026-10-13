#!/usr/bin/env bash
# Renders the app's icons and splash marks from the web's brand mark (web/src/app/icon.svg: the 見通し line, the rising
# stroke and the vermilion sun on the ink ground) with the token colours (packages/tokens/src/tokens.json). D-227, MOBILE.
# Needs rsvg-convert and ImageMagick (brew install librsvg imagemagick). Run from anywhere: bash mobile/scripts/icons.sh
set -euo pipefail
cd "$(dirname "$0")/.."
out=assets
INK="#141210"; CREAM="#F4EEE3"; SUN_DARK="#E04D26"; SUN_LIGHT="#D93E1F"

# The mark exactly as icon.svg draws it, in its 512 frame; $1 line colour, $2 sun colour, $3 extra transform.
mark() {
  cat <<SVG
<g transform="$3"><g transform="translate(69.8 21.5) scale(1.4)">
<path d="M36 262 H230" stroke="$1" stroke-width="30" stroke-linecap="round" fill="none"/>
<path d="M52 214 C 104 214, 132 142, 190 108" stroke="$1" stroke-width="30" stroke-linecap="round" fill="none"/>
<circle cx="206" cy="88" r="30" fill="$2"/></g></g>
SVG
}
svg() { echo "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 512 512\" width=\"1024\" height=\"1024\">$1</svg>"; }
render() { svg "$1" | rsvg-convert -w 1024 -h 1024 -f png -o "$2"; }

# iOS / store icon: square ink ground (the OS rounds it), no alpha channel (App Store rule).
render "<rect width=\"512\" height=\"512\" fill=\"$INK\"/>$(mark "$CREAM" "$SUN_DARK" "")" "$out/icon.png"
magick "$out/icon.png" -background "$INK" -alpha remove -alpha off "$out/icon.png"
# Android adaptive icon: the mark inside the 66 % safe circle on a transparent layer (ground from app.config.js).
SMALL="translate(256 256) scale(0.66) translate(-256 -256)"
render "$(mark "$CREAM" "$SUN_DARK" "$SMALL")" "$out/adaptive-icon.png"
render "$(mark "#FFFFFF" "#FFFFFF" "$SMALL")" "$out/adaptive-icon-monochrome.png"
# Splash marks on transparent: ink on the cream ground (light), cream on black (dark).
render "$(mark "$INK" "$SUN_LIGHT" "")" "$out/splash-icon.png"
render "$(mark "$CREAM" "$SUN_DARK" "")" "$out/splash-icon-dark.png"
echo "wrote $(ls "$out" | tr '\n' ' ')"
