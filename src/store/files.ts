import { downloadBlob } from '../core/persistence';
import { getState } from './store';

/** Offer a generated file to the user and report the outcome. Returns true when it was saved. */
export async function offerFile(blob: Blob, filename: string, what: string): Promise<boolean> {
  const outcome = await downloadBlob(blob, filename);
  const st = getState();
  if (outcome === 'saved') {
    st.toast(`${what} saved as ${filename}`, 'success');
    return true;
  }
  if (outcome === 'unavailable') st.toast(`Saving files isn't available in this view, so ${what.toLowerCase()} couldn't be saved.`, 'error');
  return false;
}
