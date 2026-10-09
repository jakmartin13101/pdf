// Product identity. BuildSuite is the suite; Takeoff Studio is this program.
export const SUITE_NAME = 'BuildSuite';
export const PRODUCT_NAME = 'Takeoff Studio';
export const FULL_NAME = `${SUITE_NAME} ${PRODUCT_NAME}`;
export const ICON_URL = './brand/takeoff-icon.svg';

/** True inside the installed Windows desktop app (Electron). */
export const isDesktop = typeof window !== 'undefined' && !!(window as unknown as { buildsuite?: unknown }).buildsuite;
