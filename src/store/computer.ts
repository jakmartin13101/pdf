// This computer's ID, for licenses tied to computers (Help → License… shows it, to send to BuildSuite).
import { desktop } from '../brand';
import { computerIdText, isComputerId } from '../core/license';
import { lsGet, lsSet } from '../core/persistence';

const KEY = 'ts.computerId';

/**
 * The desktop app's ID comes from the operating system (the same after a reinstall); in a browser, one
 * made up the first time and kept by it.
 */
export async function thisComputer(): Promise<string> {
  try {
    const id = await desktop?.computerId?.();
    if (id && isComputerId(id)) return id;
  } catch {
    /* the browser's own, below */
  }
  const saved = lsGet<string>(KEY, '');
  if (isComputerId(saved)) return saved;
  const id = computerIdText(crypto.getRandomValues(new Uint8Array(10)));
  lsSet(KEY, id);
  return id;
}
