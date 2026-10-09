import { createContext, useContext } from 'react';

/**
 * The browser window a component is rendered in. Detached split panes render into their own
 * window through a portal, so listeners, observers, menus and focus checks use this instead of the
 * global `window`/`document`.
 */
export const OwnerWindowContext = createContext<Window>(typeof window !== 'undefined' ? window : (undefined as unknown as Window));

export const useOwnerWindow = () => useContext(OwnerWindowContext);
