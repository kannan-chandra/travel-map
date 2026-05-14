const { test, expect } = require("@playwright/test");

async function topElementAtTooltipCenter(page) {
  return await page.evaluate(() => {
    const tooltip = document.querySelector("#mapHoverTooltip");
    if (!tooltip) return null;
    const rect = tooltip.getBoundingClientRect();
    const x = rect.left + (rect.width / 2);
    const y = rect.top + (rect.height / 2);
    const top = document.elementFromPoint(x, y);
    return {
      tag: top?.tagName || null,
      className: top?.className?.baseVal || top?.className || null,
      insideTooltip: Boolean(top?.closest?.("#mapHoverTooltip"))
    };
  });
}

test("location hover tooltip paints above the svg overlay", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /S'pore \/ India \/ Japan/i }).click();
  await page.waitForTimeout(350);

  const dispatched = await page.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll('circle.point-hitbox[data-point-id="airport:SFO"]'));
    const visible = candidates.find((node) => {
      const cx = Number(node.getAttribute("cx"));
      const cy = Number(node.getAttribute("cy"));
      const mapRect = document.querySelector("#map")?.getBoundingClientRect();
      return cx >= 0 && cy >= 0 && cx <= mapRect.width && cy <= mapRect.height;
    });
    if (!visible) return false;

    const mapRect = document.querySelector("#map")?.getBoundingClientRect();
    const clientX = mapRect.left + Number(visible.getAttribute("cx"));
    const clientY = mapRect.top + Number(visible.getAttribute("cy"));
    visible.dispatchEvent(new MouseEvent("mousemove", {
      bubbles: true,
      clientX,
      clientY,
      view: window
    }));
    return true;
  });

  expect(dispatched).toBeTruthy();
  await expect(page.locator("#mapHoverTooltip")).toBeVisible();
  await page.locator("#mapHoverTooltip").evaluate((node) => {
    node.style.pointerEvents = "auto";
  });

  const top = await topElementAtTooltipCenter(page);
  if (!top?.insideTooltip) {
    throw new Error(`Top element was not tooltip: ${JSON.stringify(top)}`);
  }
});

test("route hover tooltip paints above the svg overlay", async ({ page }) => {
  await page.goto("/");

  const dispatched = await page.evaluate(() => {
    const paths = Array.from(document.querySelectorAll('path.route-hitbox[data-route-key="JFK-SIN"]'));
    for (const path of paths) {
      const length = path.getTotalLength?.();
      if (!length || length < 20) continue;

      const mapRect = document.querySelector("#map")?.getBoundingClientRect();
      for (const fraction of [0.25, 0.5, 0.75]) {
        const point = path.getPointAtLength(length * fraction);
        if (point.x >= 0 && point.y >= 0 && point.x <= mapRect.width && point.y <= mapRect.height) {
          path.dispatchEvent(new MouseEvent("mousemove", {
            bubbles: true,
            clientX: mapRect.left + point.x,
            clientY: mapRect.top + point.y,
            view: window
          }));
          return true;
        }
      }
    }

    return false;
  });

  expect(dispatched).toBeTruthy();
  await expect(page.locator("#mapHoverTooltip")).toBeVisible();
  await page.locator("#mapHoverTooltip").evaluate((node) => {
    node.style.pointerEvents = "auto";
  });

  const top = await topElementAtTooltipCenter(page);
  expect(top?.insideTooltip).toBeTruthy();
});
