// Node 25+ exposes its own Web Storage globals. Browser tests must use the
// isolated storage belonging to the jsdom window, never Node's file storage.
const browserWindow = (globalThis as unknown as { jsdom: { window: Window } }).jsdom.window;
for (const key of ["localStorage", "sessionStorage"] as const) {
  Object.defineProperty(globalThis, key, { configurable: true, value: browserWindow[key] });
}
