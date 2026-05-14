const { test, expect } = require("@playwright/test");

test("trip detail is hidden by default and floats inside the map when a trip is selected", async ({ page }) => {
  await page.goto("/");

  const tripDetail = page.locator("#tripDetail");
  await expect(tripDetail).toBeHidden();

  await page.getByRole("button", { name: /Hawaii/i }).click();
  await expect(tripDetail).toBeVisible();
  await expect(tripDetail).toContainText("Hawaii");

  const mapBox = await page.locator("#map").boundingBox();
  const detailBox = await tripDetail.boundingBox();

  expect(mapBox).not.toBeNull();
  expect(detailBox).not.toBeNull();
  expect(detailBox.x).toBeGreaterThanOrEqual(mapBox.x);
  expect(detailBox.y).toBeGreaterThanOrEqual(mapBox.y);
  expect(detailBox.x + detailBox.width).toBeLessThanOrEqual(mapBox.x + mapBox.width);
  expect(detailBox.y + detailBox.height).toBeLessThanOrEqual(mapBox.y + mapBox.height);
});
