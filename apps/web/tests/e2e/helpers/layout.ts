import { expect, type Locator, type Page } from "@playwright/test";

export async function expectNoDocumentOverflow(page: Page) {
  const diagnostic = await page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    const documentWidth = document.documentElement.scrollWidth;
    const offenders = Array.from(document.body.querySelectorAll<HTMLElement>("*"))
      .map((element) => {
        const box = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          tag: element.tagName.toLowerCase(),
          slot: element.getAttribute("data-slot"),
          aria: element.getAttribute("aria-label"),
          className: element.className?.toString().slice(0, 160),
          left: Math.round(box.left * 100) / 100,
          right: Math.round(box.right * 100) / 100,
          width: Math.round(box.width * 100) / 100,
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
          position: style.position,
          overflowX: style.overflowX
        };
      })
      .filter(
        (element) =>
          element.right > viewportWidth + 2 || element.left < -2
      )
      .sort((left, right) => right.right - left.right)
      .slice(0, 20);

    return {
      overflow: documentWidth - viewportWidth,
      viewportWidth,
      documentWidth,
      offenders
    };
  });

  expect(
    diagnostic.overflow,
    JSON.stringify(diagnostic)
  ).toBeLessThanOrEqual(2);
}

export async function rect(locator: Locator) {
  await expect(locator).toBeVisible();
  const value = await locator.boundingBox();
  expect(value).not.toBeNull();
  return value!;
}
