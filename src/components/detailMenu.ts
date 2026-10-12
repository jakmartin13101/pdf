// "Standard Details" submenu for markups (Markups List and drawing right-click menus):
// add or take off a detail by hand on every selected markup.
import { getState } from '../store/store';
import { buildRows } from '../core/columns';
import { detailApplies } from '../core/details';
import type { MenuItem } from './ContextMenu';

/** How many of the markups each standard detail currently applies to. */
export function detailCoverage(markupIds: string[]) {
  const { doc } = getState();
  const ids = new Set(markupIds);
  const rows = buildRows(doc, doc.markups.filter((m) => ids.has(m.id)));
  return (doc.standardDetails ?? []).map((d) => ({
    detail: d,
    applied: rows.filter((r) => detailApplies(r, d)).length,
    total: rows.length,
  }));
}

export function detailMenuItems(markupIds: string[]): MenuItem[] {
  const st = getState();
  const coverage = detailCoverage(markupIds);
  const n = markupIds.length;
  const handChanged = st.doc.markups.some((m) => markupIds.includes(m.id) && (m.details?.length || m.detailsOff?.length));
  const items: MenuItem[] = coverage
    .filter((c) => c.detail.enabled)
    .map((c) => ({
      label: `${c.detail.name}${c.applied && c.applied < c.total ? ` (${c.applied} of ${c.total})` : ''}`,
      checked: c.applied === c.total && c.total > 0,
      // All selected already have it: take it off; otherwise add it to every selected markup.
      onClick: () => {
        const on = c.applied < c.total;
        st.setMarkupDetail(c.detail.id, markupIds, on);
        st.toast(`${on ? 'Added' : 'Took off'} “${c.detail.name}” ${on ? 'to' : 'from'} ${n} markup${n === 1 ? '' : 's'}`, 'success');
      },
    }));
  if (!items.length) items.push({ label: '(no standard details yet)', disabled: true });
  items.push(
    { sep: true },
    { label: n > 1 ? `New Detail for These ${n}…` : 'New Detail for This…', onClick: () => st.setDialog({ kind: 'details', newForMarkupIds: markupIds }) },
    { label: 'Back to Rules Only', disabled: !handChanged, onClick: () => st.resetMarkupDetails(markupIds) },
    { label: 'Standard Details…', onClick: () => st.setDialog({ kind: 'details' }) },
  );
  return items;
}
