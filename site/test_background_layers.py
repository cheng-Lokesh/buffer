from pathlib import Path
import hashlib
import unittest


ROOT = Path(__file__).resolve().parent
HTML_FILES = (ROOT / "index.src.html", ROOT / "index.html")
STATIC_ASSET = ROOT / "assets" / "bg_animation_base.png"
USER_PANORAMA = ROOT / "assets" / "night_panorama_user_crop.png"
ASTRO_PANORAMA = ROOT / "assets" / "night_panorama_astrophotography_v2.png"
STARFIELD_SCRIPT = ROOT / "starfield-background.js"
EXPECTED_SHA256 = "2B76CE05163D5886F15B6F0BBE3333EC0F2FBBFDD073774EBE5F7E13754315AA"


class BackgroundLayerContractTests(unittest.TestCase):
    def test_supplied_landscape_remains_packaged_and_unchanged(self):
        self.assertTrue(STATIC_ASSET.is_file())
        self.assertGreater(STATIC_ASSET.stat().st_size, 1_000_000)
        self.assertEqual(hashlib.sha256(STATIC_ASSET.read_bytes()).hexdigest().upper(), EXPECTED_SHA256)

    def test_user_panorama_is_packaged_as_a_crisp_2048_by_336_crop(self):
        self.assertTrue(USER_PANORAMA.is_file())
        self.assertGreater(USER_PANORAMA.stat().st_size, 400_000)
        png = USER_PANORAMA.read_bytes()
        self.assertEqual(png[:8], b"\x89PNG\r\n\x1a\n")
        self.assertEqual(int.from_bytes(png[16:20], "big"), 2048)
        self.assertEqual(int.from_bytes(png[20:24], "big"), 336)

    def test_photographic_starfield_panorama_is_packaged_at_exact_hero_size(self):
        self.assertTrue(ASTRO_PANORAMA.is_file())
        self.assertGreater(ASTRO_PANORAMA.stat().st_size, 1_000_000)
        png = ASTRO_PANORAMA.read_bytes()
        self.assertEqual(png[:8], b"\x89PNG\r\n\x1a\n")
        self.assertEqual(int.from_bytes(png[16:20], "big"), 2048)
        self.assertEqual(int.from_bytes(png[20:24], "big"), 336)

    def test_pages_use_the_user_panorama_and_procedural_sky(self):
        for path in HTML_FILES:
            html = path.read_text(encoding="utf-8")
            with self.subTest(path=path.name):
                self.assertIn('class="night-panorama"', html)
                self.assertIn('src="assets/night_panorama_astrophotography_v2.png"', html)
                self.assertIn('<canvas id="starfieldCanvas"', html)
                self.assertIn('<script src="starfield-background.js"></script>', html)
                self.assertNotIn('licensed-bg-video', html)
                self.assertNotIn('pexels_34448740', html)
                self.assertNotIn('aurora-layer', html)
                self.assertNotIn('cinematic_aurora', html)

    def test_panorama_layer_is_crisp_and_never_blurred(self):
        for path in HTML_FILES:
            html = path.read_text(encoding="utf-8")
            with self.subTest(path=path.name):
                self.assertIn('.night-panorama {', html)
                visual_rule = html.split('.night-panorama {', 1)[1].split('}', 1)[0]
                self.assertIn('object-fit:cover', visual_rule)
                self.assertNotIn('blur(', visual_rule)

    def test_reduced_motion_contract_is_present(self):
        for path in HTML_FILES:
            html = path.read_text(encoding="utf-8")
            with self.subTest(path=path.name):
                self.assertIn("prefers-reduced-motion: reduce", html)
                self.assertIn(".starfield-canvas", html)

    def test_transparent_motion_layer_has_accessible_random_motion_systems(self):
        self.assertTrue(STARFIELD_SCRIPT.is_file())
        script = STARFIELD_SCRIPT.read_text(encoding="utf-8")
        for contract in (
            "requestAnimationFrame",
            "devicePixelRatio",
            "prefers-reduced-motion",
            "visibilitychange",
            "scheduleMeteor",
            "spawnMeteor",
            "dataset.meteorsSpawned",
            "Math.random",
        ):
            self.assertIn(contract, script)
        self.assertGreaterEqual(script.count("Math.random"), 2)

    def test_star_motion_uses_independent_irregular_events_instead_of_periodic_waves(self):
        script = STARFIELD_SCRIPT.read_text(encoding="utf-8")
        self.assertIn("STAR_TWINKLE_GAP_MIN = 700", script)
        self.assertIn("STAR_TWINKLE_GAP_MAX = 6500", script)
        self.assertIn("startRandomTwinkle", script)
        self.assertIn("nextTwinkleAt", script)
        self.assertIn("twinkleState", script)
        self.assertIn("random(90, 280)", script)
        self.assertIn("random(650, 2600)", script)
        self.assertNotIn("star.breathPeriod", script)
        self.assertNotIn("star.glintPeriod", script)
        self.assertNotIn("scintillationRate", script)
        self.assertNotIn("shimmerSpeed", script)
        self.assertNotIn("breathSpeed", script)

    def test_rare_sky_events_are_spaced_far_apart(self):
        script = STARFIELD_SCRIPT.read_text(encoding="utf-8")
        self.assertIn("random(25000, 60000)", script)
        self.assertNotIn("scheduleConstellation", script)

    def test_starfield_animates_only_a_small_fixed_set_of_photographic_anchor_stars(self):
        script = STARFIELD_SCRIPT.read_text(encoding="utf-8")
        self.assertIn("ANCHOR_STARS", script)
        self.assertIn("MIN_VISIBLE_ANCHORS = 18", script)
        self.assertIn("twinkleEnvelope", script)
        self.assertIn("updateTwinkleEnvelope", script)
        self.assertIn("dataset.anchorStars", script)
        self.assertNotIn("makeStar", script)
        self.assertNotIn("signatureStars", script)

    def test_photographic_galaxy_has_a_subtle_independent_breathing_layer(self):
        script = STARFIELD_SCRIPT.read_text(encoding="utf-8")
        self.assertIn("drawGalaxyBreath", script)
        self.assertIn("GALAXY_BREATH_PERIOD = 16", script)
        self.assertIn("dataset.galaxyBreathing", script)

    def test_single_random_star_bloom_provides_visible_life_without_global_flashing(self):
        script = STARFIELD_SCRIPT.read_text(encoding="utf-8")
        self.assertIn("scheduleSpark", script)
        self.assertIn("nextSparkDelay", script)
        self.assertIn("random(500, 1400)", script)
        self.assertIn("random(2400, 8000)", script)
        self.assertIn("random(700, 3200)", script)
        self.assertIn("dataset.sparkEvents", script)
        self.assertIn("activeSpark", script)

    def test_motion_has_a_visible_energy_floor_instead_of_merely_running(self):
        script = STARFIELD_SCRIPT.read_text(encoding="utf-8")
        self.assertIn("VISIBLE_STAR_RADIUS_MIN = 1.05", script)
        self.assertIn("VISIBLE_STAR_ALPHA_MIN = .34", script)
        self.assertIn("GALAXY_GLOW_ALPHA_MIN = .07", script)
        self.assertIn("GALAXY_GLOW_ALPHA_MAX = .18", script)
        self.assertIn("dataset.visibleEnergy", script)
        self.assertIn("visibleEnergy: 'high'", script)

    def test_milky_way_is_photographic_and_not_redrawn_by_canvas(self):
        script = STARFIELD_SCRIPT.read_text(encoding="utf-8")
        self.assertNotIn("drawMilkyWayClouds", script)
        self.assertNotIn("drawMilkyWayDustLanes", script)
        self.assertNotIn("destination-out", script)
        self.assertNotIn("CONSTELLATIONS", script)

    def test_user_supplied_asset_and_crop_are_documented(self):
        credits = (ROOT / "ASSET_CREDITS.md").read_text(encoding="utf-8")
        self.assertIn("User-supplied panorama", credits)
        self.assertIn("2172 x 724", credits)
        self.assertIn("2048 x 336", credits)

    def test_top_scenery_quotes_are_reversibly_hidden(self):
        for path in HTML_FILES:
            html = path.read_text(encoding="utf-8")
            with self.subTest(path=path.name):
                self.assertIn(".q-tl, .q-tr { display:none; }", html)
                self.assertIn('class="quote q-tl"', html)
                self.assertIn('class="quote q-tr"', html)


if __name__ == "__main__":
    unittest.main(verbosity=2)
