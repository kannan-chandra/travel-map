const { test, expect } = require("@playwright/test");

test("selected-trip airport labels are placed above or below the marker", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Europe \/ S'pore/i }).click();
  await page.waitForTimeout(350);

  const label = page.locator("text.point-label-text").filter({ hasText: "LHR" }).first();
  const marker = page.locator('circle.point-marker[data-point-id="airport:LHR"]').first();

  await expect(label).toBeVisible();
  await expect(marker).toBeVisible();

  const labelBox = await label.boundingBox();
  const markerBox = await marker.boundingBox();

  expect(labelBox).not.toBeNull();
  expect(markerBox).not.toBeNull();

  const labelCenterX = labelBox.x + (labelBox.width / 2);
  const markerCenterX = markerBox.x + (markerBox.width / 2);
  const horizontalDelta = Math.abs(labelCenterX - markerCenterX);
  const labelIsAbove = labelBox.y + labelBox.height <= markerBox.y;
  const labelIsBelow = labelBox.y >= markerBox.y + markerBox.height;

  expect(horizontalDelta).toBeLessThanOrEqual(12);
  expect(labelIsAbove || labelIsBelow).toBeTruthy();
});

test("short airport-code labels keep comfortable horizontal padding", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /S'pore \/ India \/ Japan/i }).click();
  await page.waitForTimeout(350);

  const labelText = page.locator("text.point-label-text").filter({ hasText: "SFO" }).first();
  const labelBg = page.locator("rect.point-label-bg").first();

  await expect(labelText).toBeVisible();
  await expect(labelBg).toBeVisible();

  const metrics = await labelText.evaluate((node) => {
    const text = node.getBBox();
    const bg = node.previousElementSibling.getBBox();
    return {
      textX: text.x,
      textWidth: text.width,
      bgX: bg.x,
      bgWidth: bg.width
    };
  });

  const leftPadding = metrics.textX - metrics.bgX;
  const rightPadding = (metrics.bgX + metrics.bgWidth) - (metrics.textX + metrics.textWidth);

  expect(leftPadding).toBeGreaterThanOrEqual(8);
  expect(rightPadding).toBeGreaterThanOrEqual(8);
});
