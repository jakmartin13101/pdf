// Text and icon size (Settings → General): the whole program larger or smaller, as a window zoom. The
// desktop app zooms its windows (as Chromium's own zoom does); in a browser the page zooms its content and
// reads pointer positions and sizes in the zoomed page's own pixels, so drawing, dragging and menus still
// line up with the pointer. The browser's own zoom stays the user's.
import { desktop } from '../brand';

export const UI_SCALES = [0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
export const MIN_UI_SCALE = UI_SCALES[0];
export const MAX_UI_SCALE = UI_SCALES[UI_SCALES.length - 1];

export const clampUiScale = (s: number) => (Number.isFinite(s) ? Math.min(MAX_UI_SCALE, Math.max(MIN_UI_SCALE, Math.round(s * 100) / 100)) : 1);

/** The next size up or down the list (from a size between two, the nearer step that way). */
export function stepUiScale(s: number, dir: 1 | -1): number {
  const next = dir > 0 ? UI_SCALES.find((x) => x > s + 0.001) : [...UI_SCALES].reverse().find((x) => x < s - 0.001);
  return next ?? s;
}

let scale = 1;

export function applyUiScale(s: number) {
  scale = clampUiScale(s);
  if (desktop?.setZoom) {
    void desktop.setZoom(scale).catch(() => undefined);
    return;
  }
  if (typeof document === 'undefined') return;
  if (scale !== 1) zoomAwareCoordinates();
  document.documentElement.style.zoom = scale === 1 ? '' : String(scale);
}

let patched = false;

/**
 * With the page's root zoomed, the browser gives pointer positions and element boxes in screen pixels but
 * lays out in the page's own: these give them in the page's own, as with the browser's zoom.
 */
function zoomAwareCoordinates() {
  if (patched) return;
  patched = true;
  const k = () => scale;
  const divide = (o: object, name: string) => {
    const d = Object.getOwnPropertyDescriptor(o, name);
    if (!d?.get) return;
    const get = d.get;
    Object.defineProperty(o, name, { ...d, get(this: unknown) { return (get.call(this) as number) / k(); } });
  };
  for (const n of ['clientX', 'clientY', 'pageX', 'pageY', 'x', 'y']) divide(MouseEvent.prototype, n);
  divide(window, 'innerWidth');
  divide(window, 'innerHeight');
  // Drawings render sharp at the larger size.
  const dpr = Object.getOwnPropertyDescriptor(window, 'devicePixelRatio');
  if (dpr?.get) {
    const get = dpr.get;
    Object.defineProperty(window, 'devicePixelRatio', { ...dpr, get: () => (get.call(window) as number) * k() });
  }
  const rect = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const r = rect.call(this);
    const z = k();
    // Elements of other windows (a pane opened in its own window) are not zoomed.
    return z === 1 || this.ownerDocument !== document ? r : new DOMRect(r.x / z, r.y / z, r.width / z, r.height / z);
  };
  const many = Document.prototype.elementsFromPoint;
  Document.prototype.elementsFromPoint = function (this: Document, x: number, y: number) {
    const z = this === document ? k() : 1;
    return many.call(this, x * z, y * z);
  };
  const one = Document.prototype.elementFromPoint;
  Document.prototype.elementFromPoint = function (this: Document, x: number, y: number) {
    const z = this === document ? k() : 1;
    return one.call(this, x * z, y * z);
  };
}
