# User panorama, photographic sky, and transparent motion evidence

## Decision

The background uses the user-supplied night panorama as the landscape anchor. A generated photographic sky replaces only the original black sky. Canvas is limited to subtle anchor-star breathing and rare meteors.

## Rendering stack

1. `night_panorama_astrophotography_v2.png` is the exact 2048 x 336 production crop.
2. The bitmap contains the fine star density, Milky Way structure, and dust lanes, avoiding synthetic canvas-generated galaxy effects.
3. `starfield-background.js` animates 18 fixed photographic anchor stars through independent randomized twinkle envelopes, layered spectral halos, crisp cores, and brief event-driven diffraction rays.
4. Single meteors use an initial 6.5 to 11 second appearance and randomized 11 to 26 second intervals thereafter. Each event selects one of five restrained two-color spectra with a soft trail and luminous head.
5. Constellation drawings and procedural star populations were removed.

## TDD evidence

- RED command: `python -m unittest -v test_background_layers.py`
- Initial RED: both pages still referenced the rejected Pexels video; the supplied panorama crop, Canvas layer, randomized schedulers, and updated provenance record were absent.
- GREEN command: `python -m unittest -v test_background_layers.py`
- The supplied landscape remains unchanged at SHA-256 `2B76CE05163D5886F15B6F0BBE3333EC0F2FBBFDD073774EBE5F7E13754315AA`.

### Slow-breathing correction

- User journey: the dashboard sky should feel calm and natural, with stars that breathe slowly instead of flashing like an electronic light array.
- RED command: `python -m unittest -v test_background_layers.py`
- RED result: 2 new cadence tests failed because the old implementation still used high-frequency `breathSpeed` and `shimmerSpeed`, with meteor intervals as short as 3.2 seconds.
- GREEN command: `python -m unittest -v test_background_layers.py; node --check starfield-background.js`
- GREEN result: 10 tests passed and JavaScript syntax validation passed.
- Browser evidence: after reload, the first 10 seconds produced zero meteors and zero constellations; the canvas stayed active with 224 stars and no console warnings or errors.

### Layered astrophotography correction

- User journey: the sky should resemble a composed nightscape rather than evenly scattered dots, and a small number of hero stars should visibly twinkle without making the whole scene busy.
- RED command: `python -m unittest -v test_background_layers.py`
- RED result: new contracts failed because the previous renderer had no signature-star class, atmospheric twinkle envelope, chromatic shift, Milky Way star clouds, or dark dust lanes.
- GREEN command: `python -m unittest -v test_background_layers.py; node --check starfield-background.js`
- GREEN result: 12 tests passed and JavaScript syntax validation passed.
- Browser evidence: the current viewport renders 344 total stars with 14 independently phased signature stars. Two screenshots 3.6 seconds apart visibly showed different leading stars, while no meteor or constellation was forced during initial rendering. The console stayed clean.

### Photographic-base replacement

- User journey: the star field should derive its beauty from a coherent photographic sky rather than visible procedural dots, glows, and artificial galaxy strokes.
- RED command: `python -m unittest -v test_background_layers.py`
- RED result: 6 contracts failed because the photographic asset was absent, both pages referenced the older crop, and Canvas still generated the Milky Way, random stars, cross flares, and constellations.
- GREEN command: `python -m unittest -v test_background_layers.py; node --check starfield-background.js`
- GREEN result: 13 tests passed and JavaScript syntax validation passed.
- Browser evidence: the production crop displayed correctly, nine anchor stars remained active, the Canvas produced no synthetic galaxy or constellation layer, and the console had no warnings or errors.

### Perceptible-life correction

- User journey: the photographic sky should remain credible while its animation is immediately perceptible as living starlight.
- RED command: `python -m unittest -v test_background_layers.py`
- RED result: the new life-sign contracts failed because the renderer had only nine weak anchors and no independent galaxy breath or single-star bloom scheduler.
- GREEN command: `python -m unittest -v test_background_layers.py; node --check starfield-background.js`
- GREEN result: 15 tests passed and JavaScript syntax validation passed.
- Browser evidence: the viewport reported 18 anchor stars, active 16-second galaxy breathing, and two independently scheduled star blooms within the observed interval. No meteor was forced and the console stayed clean.

### Visible-energy regression correction

- Root cause: the Canvas loop was running, but its 0.58–0.94 CSS-pixel cores and roughly 0.5–1.5% effective galaxy glow were visually absorbed by the photographic star field.
- RED command: `python -m unittest -v test_background_layers.py`
- RED result: the visible-energy floor contract failed because the renderer had no minimum star radius, minimum star alpha, or measurable galaxy-glow range.
- GREEN command: `python -m unittest -v test_background_layers.py; node --check starfield-background.js`
- GREEN result: 16 tests passed and JavaScript syntax validation passed.
- Browser evidence: the live page reported `visibleEnergy=high`, 18 active anchor stars, a running galaxy breath, and reduced motion disabled. Two 1280×720 captures showed 2,411 changed hero pixels above a four-level luma threshold, including 960 stronger changes above twelve levels. The only console error was the unrelated missing `favicon.ico`.

### Irregular-starlight correction

- User journey: individual stars should flare and fade like independent atmospheric events, not repeat recognizable sine-wave breathing cycles.
- RED command: `python -m unittest -v test_background_layers.py`
- RED result: the irregular-event contract failed because every star still used repeating breath, glint, and scintillation periods.
- GREEN command: `python -m unittest -v test_background_layers.py; node --check starfield-background.js`
- GREEN result: 16 tests passed and JavaScript syntax validation passed.
- Browser evidence: the live renderer reported 18 independent anchors, 60 stochastic twinkle events during the observed browser interval, seven separately scheduled bloom events, no forced meteor, and reduced motion disabled. Each twinkle now randomizes its wait, attack, hold, decay, intensity, and halo expansion.

### Spectral-star and colorful-meteor refinement

- User journey: keep the accepted star-twinkle speed while making individual stars more beautiful, and let colorful meteors appear occasionally at a lower frequency than starlight events.
- RED command: `python site/test_background_layers.py`
- RED result: 15 tests passed and two new contracts failed because stars still used one circular halo and meteors still used a narrow three-color list with 25 to 60 second scheduling.
- RED checkpoint: `c0fa1a6 test: add RED contract for spectral stars and meteors`.
- GREEN command: `python site/test_background_layers.py`; syntax command: `node --check site/starfield-background.js`.
- GREEN result: 17 tests passed and JavaScript syntax validation passed.
- Browser evidence: the live renderer reported 18 anchors, five meteor palettes, no console warnings or errors, and preserved the original 700 to 6500 ms stochastic twinkle cadence. A real rose-spectrum meteor was captured with a white head, magenta-violet core trail, and soft colored bloom. Reduced motion continues to disable the Canvas animation.
- Coverage boundary: this standalone Canvas script has no line-coverage harness. The focused contract suite covers cadence constants, renderer layers, palette systems, diagnostics, reduced motion, asset integrity, and forbidden regressions; real-browser observation covers the rendered motion. User visual acceptance remains separate.

## Accessibility and resilience

- Reduced-motion mode relies entirely on the photographic star field and disables Canvas animation.
- Animation stops when the browser hides the page and resumes with fresh schedules when it returns.
- Canvas resolution follows the device pixel ratio, capped at 2 for a balance of sharpness and GPU cost.
- The effect layer is pointer-transparent and cannot block product controls.

## Product boundary

Only the atmospheric background stack changed. Buffer navigation, financial semantics, data, controls, and content remain unchanged. Technical checks and internal visual review do not replace user visual acceptance.
