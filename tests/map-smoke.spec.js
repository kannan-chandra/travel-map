const { test, expect } = require("@playwright/test");

async function getOverlaySnapshot(page) {
  return page.evaluate(() => {
    const mapEl = document.getElementById("map");
    const svg = document.querySelector("svg.route-overlay");
    const visibleRoutePaths = Array.from(svg.querySelectorAll("path"))
      .filter((path) => !path.classList.contains("route-hitbox"));
    const visiblePointMarkers = Array.from(svg.querySelectorAll("circle.point-marker"));
    const mapRect = mapEl.getBoundingClientRect();
    const svgRect = svg.getBoundingClientRect();
    const onScreenRoutes = visibleRoutePaths.filter((path) => {
      const rect = path.getBoundingClientRect();
      return rect.right >= mapRect.left && rect.left <= mapRect.right &&
        rect.bottom >= mapRect.top && rect.top <= mapRect.bottom;
    });
    const onScreenPoints = visiblePointMarkers.filter((marker) => {
      const rect = marker.getBoundingClientRect();
      return rect.right >= mapRect.left && rect.left <= mapRect.right &&
        rect.bottom >= mapRect.top && rect.top <= mapRect.bottom;
    });

    return {
      mapRect: { left: mapRect.left, top: mapRect.top, right: mapRect.right, bottom: mapRect.bottom },
      svgRect: { left: svgRect.left, top: svgRect.top, right: svgRect.right, bottom: svgRect.bottom },
      routeCount: visibleRoutePaths.length,
      pointCount: visiblePointMarkers.length,
      onScreenRouteCount: onScreenRoutes.length,
      onScreenPointCount: onScreenPoints.length
    };
  });
}

async function recordZoomAnimationError(page, pointId, trigger) {
  await page.evaluate(({ pointId }) => {
    const mapEl = document.getElementById("map");
    const mapRect = mapEl.getBoundingClientRect();
    const target = pointId;
    const samples = [];
    let startZoom = null;
    let startCenter = null;

    function projectAt(latlng, zoom, center) {
      const viewHalf = map.getSize().divideBy(2);
      const projected = map.project(latlng, zoom);
      const pixelOrigin = map.project(center, zoom).subtract(viewHalf);
      return projected.subtract(pixelOrigin);
    }

    function closestMarker(expectedX, expectedY) {
      const markers = Array.from(document.querySelectorAll(`[data-point-id="${target}"]`));
      return markers.reduce((best, marker) => {
        const rect = marker.getBoundingClientRect();
        const x = rect.left + (rect.width / 2);
        const y = rect.top + (rect.height / 2);
        const distance = Math.hypot(x - expectedX, y - expectedY);
        if (!best || distance < best.distance) {
          return { distance, x, y, width: rect.width, height: rect.height };
        }
        return best;
      }, null);
    }

    window.__zoomAnimationSamples = samples;

    map.once("zoomstart", () => {
      startZoom = map.getZoom();
      startCenter = map.getCenter();
    });

    map.on("zoomanim", function onZoomAnim(event) {
      const containerPoint = projectAt(AIRPORTS.PIT, event.zoom, event.center);
      const expectedX = mapRect.left + containerPoint.x;
      const expectedY = mapRect.top + containerPoint.y;
      const actual = closestMarker(expectedX, expectedY);
      samples.push({
        zoom: event.zoom,
        expectedX,
        expectedY,
        actualX: actual?.x ?? null,
        actualY: actual?.y ?? null,
        actualWidth: actual?.width ?? null,
        actualHeight: actual?.height ?? null,
        distance: actual ? actual.distance : null,
        startZoom,
        startCenter
      });
    });

    map.once("zoomend", () => {
      map.off("zoomanim");
    });
  }, { pointId });

  await trigger();

  return page.evaluate(() => window.__zoomAnimationSamples || []);
}

async function measureMarkerAlignment(page, pointId, airportCode) {
  return page.evaluate(({ pointId, airportCode }) => {
    const mapEl = document.getElementById("map");
    const mapRect = mapEl.getBoundingClientRect();
    const airport = AIRPORTS[airportCode];
    const viewHalf = map.getSize().divideBy(2);
    const projected = map.project(L.latLng(airport.lat, airport.lng), map.getZoom());
    const pixelOrigin = map.project(map.getCenter(), map.getZoom()).subtract(viewHalf);
    const expected = projected.subtract(pixelOrigin);
    const expectedX = mapRect.left + expected.x;
    const expectedY = mapRect.top + expected.y;

    const markers = Array.from(document.querySelectorAll(`[data-point-id="${pointId}"]`));
    const closest = markers.reduce((best, marker) => {
      const rect = marker.getBoundingClientRect();
      const x = rect.left + (rect.width / 2);
      const y = rect.top + (rect.height / 2);
      const distance = Math.hypot(x - expectedX, y - expectedY);
      if (!best || distance < best.distance) {
        return { distance, x, y, expectedX, expectedY };
      }
      return best;
    }, null);

    return closest;
  }, { pointId, airportCode });
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
});

test("initial render shows overlay content on top of the map", async ({ page }) => {
  const snapshot = await getOverlaySnapshot(page);

  expect(snapshot.routeCount).toBeGreaterThan(0);
  expect(snapshot.pointCount).toBeGreaterThan(0);
  expect(snapshot.onScreenRouteCount).toBeGreaterThan(0);
  expect(snapshot.onScreenPointCount).toBeGreaterThan(0);
  expect(snapshot.svgRect.right).toBeGreaterThan(snapshot.mapRect.left);
  expect(snapshot.svgRect.bottom).toBeGreaterThan(snapshot.mapRect.top);
});

test("one-world horizontal pan keeps the overlay aligned", async ({ page }) => {
  const before = await measureMarkerAlignment(page, "airport:SIN", "SIN");
  expect(before.distance).toBeLessThan(20);

  await page.evaluate(() => {
    const zoom = map.getZoom();
    const worldWidth = map.project(L.latLng(0, 360), zoom).x - map.project(L.latLng(0, 0), zoom).x;
    map.panBy([worldWidth, 0], { animate: false });
  });
  await page.waitForTimeout(200);

  const snapshot = await getOverlaySnapshot(page);
  const after = await measureMarkerAlignment(page, "airport:SIN", "SIN");

  expect(snapshot.onScreenRouteCount).toBeGreaterThan(0);
  expect(snapshot.pointCount).toBeGreaterThan(0);
  expect(after.distance).toBeLessThan(20);
});

test("wrapped mouse drag keeps the overlay visible", async ({ page }) => {
  const mapBox = await page.locator("#map").boundingBox();
  expect(mapBox).not.toBeNull();

  await page.mouse.move(mapBox.x + mapBox.width * 0.7, mapBox.y + mapBox.height * 0.5);
  await page.mouse.down();
  for (let i = 0; i < 14; i += 1) {
    await page.mouse.move(
      mapBox.x + mapBox.width * 0.7 - ((i + 1) * 120),
      mapBox.y + mapBox.height * 0.5,
      { steps: 8 }
    );
  }
  await page.mouse.up();
  await page.waitForTimeout(300);

  const snapshot = await getOverlaySnapshot(page);
  const after = await measureMarkerAlignment(page, "airport:SIN", "SIN");

  expect(snapshot.onScreenRouteCount).toBeGreaterThan(0);
  expect(snapshot.onScreenPointCount).toBeGreaterThan(0);
  expect(after.distance).toBeLessThan(24);
});

test("plain pan after reload keeps overlay aligned with the basemap", async ({ page }) => {
  const before = await measureMarkerAlignment(page, "airport:SIN", "SIN");
  expect(before.distance).toBeLessThan(20);

  await page.evaluate(() => {
    map.panBy([260, 120], { animate: false });
  });
  await page.waitForTimeout(200);

  const after = await measureMarkerAlignment(page, "airport:SIN", "SIN");
  expect(after.distance).toBeLessThan(20);
});

test("trip fit followed by pan keeps overlay aligned with the basemap", async ({ page }) => {
  await page.getByRole("button", { name: /Hawaii/i }).click();
  await page.waitForTimeout(300);

  const before = await measureMarkerAlignment(page, "airport:HNL", "HNL");
  expect(before.distance).toBeLessThan(20);

  await page.evaluate(() => {
    map.panBy([180, -100], { animate: false });
  });
  await page.waitForTimeout(200);

  const after = await measureMarkerAlignment(page, "airport:HNL", "HNL");
  expect(after.distance).toBeLessThan(20);
});

test("small trip zoom keeps overlay content visible", async ({ page }) => {
  await page.getByRole("button", { name: /Hawaii/i }).click();
  await page.waitForTimeout(300);

  const fittedSnapshot = await getOverlaySnapshot(page);
  expect(fittedSnapshot.onScreenRouteCount).toBeGreaterThan(0);
  expect(fittedSnapshot.onScreenPointCount).toBeGreaterThan(0);

  await page.click(".leaflet-control-zoom-in");
  await page.waitForTimeout(300);
  await page.click(".leaflet-control-zoom-in");
  await page.waitForTimeout(300);

  const snapshot = await getOverlaySnapshot(page);

  expect(snapshot.onScreenRouteCount).toBeGreaterThan(0);
  expect(snapshot.pointCount).toBeGreaterThan(0);
});

test("zoom animation keeps overlay markers aligned with the basemap", async ({ page }) => {
  const samples = await recordZoomAnimationError(page, "airport:PIT", async () => {
    await page.click(".leaflet-control-zoom-in");
    await page.waitForTimeout(500);
  });

  expect(samples.length).toBeGreaterThan(0);
  const measuredSamples = samples.filter((sample) => Number.isFinite(sample.distance));
  expect(measuredSamples.length).toBeGreaterThan(0);
  const worstDistance = Math.max(...measuredSamples.map((sample) => sample.distance));
  expect(worstDistance).toBeLessThan(24);

  const sizedSamples = measuredSamples.filter((sample) => Number.isFinite(sample.actualWidth));
  expect(sizedSamples.length).toBeGreaterThan(0);
  const baseWidth = sizedSamples[0].actualWidth;
  const worstWidthDelta = Math.max(...sizedSamples.map((sample) => Math.abs(sample.actualWidth - baseWidth)));
  expect(worstWidthDelta).toBeLessThan(2);
});
