# Visual asset provenance

## User-supplied panorama

- Source: image supplied directly by the user in the Codex conversation.
- Original media: 2172 x 724 PNG.
- Runtime crop: `assets/night_panorama_user_crop.png`.
- Runtime dimensions: 2048 x 336 PNG.
- Processing: cropped from the full-width source at y=100 with a 2172 x 356 crop, then resized once with Lanczos to the exact 2048 x 336 display ratio. The landscape itself was not regenerated or repainted.

## Photographic sky composite

- Runtime asset: `assets/night_panorama_astrophotography_v2.png`.
- Generated with the built-in image generation tool by editing only the black sky of the user-supplied panorama.
- The generation prompt required the terrain silhouette, mountains, snow, forest, shoreline lights, lake, foreground, and panorama framing to remain unchanged while replacing only the sky with restrained Milky Way astrophotography.
- Runtime dimensions: 2048 x 336 PNG, cropped from y=100 at 2172 x 356 and resampled once with high-quality bicubic interpolation.

## Transparent motion layer

- Runtime: `starfield-background.js`.
- The canvas no longer generates the star field or Milky Way. It animates nine fixed photographic anchor stars and an occasional randomized meteor.
- Animation pauses when the page is hidden and becomes fully static when reduced motion is requested.
- No third-party video or downloaded particle asset is used by the top background.
