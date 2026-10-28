# DigiGate icon assets

Open [preview.html](preview.html) locally to review and search the complete set. Each icon appears at 20 px and 64 px on white and dark backgrounds. Use 100% browser zoom for the size comparison. Section contact sheets are in `previews/`.

## Deliverables

- `icons/`: 159 individual SVGs covering every named interface icon in the brief, including the dashboard and common-interface filled variants and the three reused navigation variants.
- `identity/`: the five P1 PNGs, notification PNG, dashboard SVG, 180 px Apple icon and an ICO containing 16 px and 32 px images.
- `manifest.json`: file names, sections, priorities and variants.

P1 was drawn first. P2, P4 and Later assets are also supplied for review; their presence does not enable any application features. Existing app assets and configuration have not been replaced.

## Construction

Interface icons use a `0 0 24 24` viewBox, a 2 px clear margin and black filled paths. Outline icons were constructed with 1.75 px strokes and round caps and joins, then expanded and geometrically combined. Compact composite symbols are optically scaled to fit their badges. Filled variants use silhouettes; inherently linear symbols such as plus, minus and chevrons use a heavier solid shape.

There are no fonts, text elements, images, external references, gradients, strokes or masks in the exported interface SVGs. Holes and status symbols are actual transparent cutouts, using `fill-rule="evenodd"`. Preserve this fill rule when importing the paths. Recolour the path fill in the consuming application; an SVG loaded through an HTML `img` does not inherit CSS `color`.

The brief's explicit information, question, exclamation, inequality, plus/minus and parking symbols are treated as exceptions to its general no-letter/no-number rule. All glyphs are drawn paths.

Identity assets reuse the emblem from the repository's `DigiGate-logo.svg`. The wordmark is omitted. The launcher uses a white silhouette with a transparent check cutout over `#062C65`; the matching adaptive foreground and background compose to the same image. The splash retains the original emblem colours. All 1024 px identity marks stay inside the central 66% safe area. The notification icon is white on transparent.

## Regeneration

The original geometry and export pipeline are in `../tools/icons/generate.mjs`. The isolated tooling package uses Skia via `@napi-rs/canvas`; it adds no app runtime dependency. From the repository root on Windows:

```powershell
npm.cmd ci --prefix packages/design/tools/icons --no-audit --no-fund
node packages/design/tools/icons/generate.mjs
```

Regeneration replaces this generated set. Edit the construction source instead of editing generated paths. The generator checks all interface icons for finite geometry, margins, path-only output and nonblank 20/64 px rendering. Exported SVGs were additionally checked with an independent SVG renderer, including result-symbol transparency and identity dimensions/layer composition. Visual review was performed against the contact sheets; sunlight readability still needs review on the actual handheld.

No raster image-generation service was used: these are native vector drawings and deterministic exports of the existing logo. The path-operation API is documented in the [canvas project](https://github.com/Brooooooklyn/canvas#pathkit).
