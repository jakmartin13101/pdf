import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Eye, EyeOff, FolderPlus, MoreHorizontal, Plus, Wrench } from 'lucide-react';
import type { ChestTool, ToolSet } from '../../types';
import { getState, useStore } from '../../store/store';
import { ToolSwatch } from '../icons';
import { TYPE_INFO } from '../../core/markupTypes';
import { ContextMenu, type MenuItem } from '../ContextMenu';
import { defaultToolChest } from '../../core/defaults';
import { offerFile } from '../../store/files';
import { cmdImportToolChest } from '../../store/commands';
import { uid } from '../../core/ids';
import { normalizeSize, SHAPE_FAMILIES } from '../../core/steelShapes';
import { PanelHeader } from '../dock/PanelHeader';

/** Simple I-beam glyph for the steel shape tool button. */
export function BeamIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" aria-hidden>
      <path d="M5 4h14M5 20h14M12 4v16M8 4v2M16 4v2M8 18v2M16 18v2" />
    </svg>
  );
}

/** The editable size box shown on size tools; the value stays on the tool until changed here. */
function SizeBox({ tool, onEnter }: { tool: ChestTool; onEnter: () => void }) {
  const cfg = tool.sizeTool!;
  const [v, setV] = useState(cfg.value);
  useEffect(() => setV(cfg.value), [cfg.value]);
  const example = SHAPE_FAMILIES.find((f) => f.id === cfg.family && f.id)?.example ?? 'Size / label';
  const commit = () => {
    const value = normalizeSize(cfg.family, v);
    if (value !== cfg.value) getState().patchTool(tool.id, { sizeTool: { ...cfg, value } });
    setV(value);
  };
  return (
    <input
      className="size-box"
      value={v}
      placeholder={example}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          commit();
          onEnter();
          (e.target as HTMLInputElement).blur();
        }
        if (e.key === 'Escape') {
          setV(cfg.value);
          (e.target as HTMLInputElement).blur();
        }
      }}
      title="Type the size used as this tool's label (kept until you change it). Enter starts the tool."
      data-testid="size-box"
    />
  );
}

export function ToolChestPanel() {
  const sets = useStore((s) => s.toolChest);
  const tool = useStore((s) => s.tool);
  const selection = useStore((s) => s.selection);
  const loaded = useStore((s) => s.loaded);
  const showHidden = useStore((s) => s.ui.showHiddenTools);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const st = getState;
  const hiddenCount = sets.reduce((n, s) => n + (s.hidden ? 1 : 0) + s.tools.filter((t) => t.hidden).length, 0);

  const activate = (t: ChestTool, toggle = true) => {
    if (!loaded) return;
    const cur = st().tool;
    if (toggle && cur.kind === 'markup' && cur.chestToolId === t.id) st().setTool({ kind: 'select' });
    else st().setTool({ kind: 'markup', type: t.type, chestToolId: t.id });
  };

  const toolMenu = (e: React.MouseEvent, set: ToolSet, t: ChestTool) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: 'Use Tool', onClick: () => activate(t, false) },
        {
          label: 'Properties…',
          onClick: () => st().setDialog(t.sizeTool ? { kind: 'shapeTool', setId: set.id, toolId: t.id } : { kind: 'toolEdit', setId: set.id, toolId: t.id }),
        },
        { label: 'Duplicate', onClick: () => st().upsertTool(set.id, { ...structuredClone(t), id: uid('tool'), name: `${t.name} copy` }) },
        { label: t.hidden ? 'Show Tool' : 'Hide Tool', onClick: () => st().patchTool(t.id, { hidden: !t.hidden }) },
        {
          label: 'Apply to Selected Markups',
          disabled: !selection.length,
          onClick: () => applyToolToSelection(t),
        },
        {
          label: 'Move to Set',
          children: sets.filter((s) => s.id !== set.id).map((s) => ({ label: s.name, onClick: () => st().upsertTool(s.id, t) })),
        },
        { sep: true },
        { label: 'Delete Tool', danger: true, onClick: () => st().deleteTool(set.id, t.id) },
      ],
    });
  };

  const setMenuFor = (e: React.MouseEvent, set: ToolSet) => {
    e.preventDefault();
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: 'New Tool…', onClick: () => st().setDialog({ kind: 'toolEdit', setId: set.id }) },
        { label: 'New Steel Shape / Size Tool…', onClick: () => st().setDialog({ kind: 'shapeTool', setId: set.id }) },
        { label: 'Add Selected Markup as Tool', disabled: selection.length !== 1, onClick: () => st().setDialog({ kind: 'toolEdit', setId: set.id, fromMarkupId: selection[0] }) },
        { label: 'Rename', onClick: () => setRenaming(set.id) },
        { label: set.hidden ? 'Show Set' : 'Hide Set', onClick: () => st().updateToolSet(set.id, { hidden: !set.hidden }) },
        {
          label: 'Show All Tools in Set',
          disabled: !set.tools.some((t) => t.hidden),
          onClick: () => st().updateToolSet(set.id, { tools: set.tools.map((t) => ({ ...t, hidden: false })) }),
        },
        {
          label: 'Export Set…',
          onClick: () => void offerFile(new Blob([JSON.stringify({ toolSets: [set] }, null, 2)], { type: 'application/json' }), `${set.name}.toolset.json`, 'Tool set'),
        },
        { sep: true },
        {
          label: 'Delete Set',
          danger: true,
          onClick: () =>
            st().setDialog({ kind: 'confirm', title: 'Delete Tool Set', message: `Delete “${set.name}” and its ${set.tools.length} tools?`, onConfirm: () => st().deleteToolSet(set.id) }),
        },
      ],
    });
  };

  const visibleSets = showHidden ? sets : sets.filter((s) => !s.hidden);

  return (
    <div className="panel" style={{ height: '100%' }}>
      <PanelHeader title="Tool Chest" icon={<Wrench size={14} />}>
        <button
          className="icon-btn"
          title="New steel shape / size tool (W, HSS, L, C… or any measurement with a typed label)"
          onClick={() => st().setDialog({ kind: 'shapeTool', setId: sets[0]?.id })}
          data-testid="btn-shape-tool"
        >
          <BeamIcon />
        </button>
        <button className="icon-btn" title="New tool set" onClick={() => setRenaming(st().addToolSet('New Tool Set'))}>
          <FolderPlus size={14} />
        </button>
        <button
          className="icon-btn"
          title="Add selected markup to the tool chest"
          disabled={selection.length !== 1}
          onClick={() => st().setDialog({ kind: 'toolEdit', setId: sets[0]?.id ?? st().addToolSet('My Tools'), fromMarkupId: selection[0] })}
        >
          <Plus size={14} />
        </button>
        <button
          className={`icon-btn${showHidden ? ' active' : ''}`}
          title={showHidden ? 'Hide hidden tools' : `Show hidden tools (${hiddenCount})`}
          onClick={() => st().setUI({ showHiddenTools: !showHidden })}
          data-testid="btn-show-hidden"
        >
          {showHidden ? <Eye size={14} /> : <EyeOff size={14} />}
        </button>
        <button
          className="icon-btn"
          title="More: import, export or restore the default tool chest"
          onClick={(e) => {
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
            setMenu({
              x: r.left,
              y: r.bottom + 2,
              items: [
                { label: 'Import Tool Sets…', onClick: cmdImportToolChest },
                {
                  label: 'Export Tool Chest…',
                  onClick: () => void offerFile(new Blob([JSON.stringify({ toolSets: sets }, null, 2)], { type: 'application/json' }), 'toolchest.json', 'Tool chest'),
                },
                { sep: true },
                {
                  label: 'Restore Default Tool Sets…',
                  onClick: () =>
                    st().setDialog({
                      kind: 'confirm',
                      title: 'Restore Default Tool Chest',
                      message: 'Replace your tool chest with the default estimating tool sets?',
                      onConfirm: () => st().setToolChest(defaultToolChest()),
                    }),
                },
              ],
            });
          }}
        >
          <MoreHorizontal size={14} />
        </button>
      </PanelHeader>
      <div className="panel-body" data-testid="toolchest">
        {visibleSets.map((set) => {
          const tools = showHidden ? set.tools : set.tools.filter((t) => !t.hidden);
          const hiddenInSet = set.tools.length - set.tools.filter((t) => !t.hidden).length;
          return (
            <div className={`chest-set${set.hidden ? ' is-hidden' : ''}`} key={set.id}>
              <div className="chest-set-head" onClick={() => st().updateToolSet(set.id, { collapsed: !set.collapsed })} onContextMenu={(e) => setMenuFor(e, set)}>
                {set.collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                {renaming === set.id ? (
                  <input
                    autoFocus
                    defaultValue={set.name}
                    onClick={(e) => e.stopPropagation()}
                    onBlur={(e) => {
                      st().updateToolSet(set.id, { name: e.target.value.trim() || set.name });
                      setRenaming(null);
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                  />
                ) : (
                  <span className="name">{set.name}</span>
                )}
                <span className="count" title={hiddenInSet ? `${hiddenInSet} hidden` : undefined}>
                  {tools.length}
                  {!showHidden && hiddenInSet ? ` +${hiddenInSet} hidden` : ''}
                </span>
                {showHidden && (
                  <button
                    className="icon-btn"
                    title={set.hidden ? 'Show this set' : 'Hide this set'}
                    onClick={(e) => {
                      e.stopPropagation();
                      st().updateToolSet(set.id, { hidden: !set.hidden });
                    }}
                  >
                    {set.hidden ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                )}
                <button
                  className="icon-btn"
                  title="New tool in this set"
                  onClick={(e) => {
                    e.stopPropagation();
                    st().setDialog({ kind: 'toolEdit', setId: set.id });
                  }}
                >
                  <Plus size={13} />
                </button>
              </div>
              {!set.collapsed && (
                <div className="chest-tools">
                  {tools.map((t) => (
                    <div
                      key={t.id}
                      role="button"
                      tabIndex={0}
                      className={`chest-tool${t.sizeTool ? ' size-tool' : ''}${t.hidden ? ' is-hidden' : ''}${tool.kind === 'markup' && tool.chestToolId === t.id ? ' active' : ''}${!loaded ? ' disabled' : ''}`}
                      onClick={() => activate(t)}
                      onKeyDown={(e) => e.key === 'Enter' && activate(t)}
                      onDoubleClick={() =>
                        st().setDialog(t.sizeTool ? { kind: 'shapeTool', setId: set.id, toolId: t.id } : { kind: 'toolEdit', setId: set.id, toolId: t.id })
                      }
                      onContextMenu={(e) => toolMenu(e, set, t)}
                      title={`${t.name} – ${TYPE_INFO[t.type].listName}${Object.keys(t.custom).length ? '\n' + Object.entries(t.custom).map(([k, v]) => `${k}: ${v}`).join('\n') : ''}`}
                      data-testid="chest-tool"
                    >
                      <ToolSwatch tool={t} />
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <span className="tname">{t.name}</span>
                        <span className="ttype">
                          {TYPE_INFO[t.type].label}
                          {t.sizeTool ? ' · size tool' : ''}
                        </span>
                      </span>
                      {t.sizeTool && <SizeBox tool={t} onEnter={() => activate(t, false)} />}
                      {showHidden && (
                        <button
                          className="icon-btn"
                          title={t.hidden ? 'Show tool' : 'Hide tool'}
                          onClick={(e) => {
                            e.stopPropagation();
                            st().patchTool(t.id, { hidden: !t.hidden });
                          }}
                          data-testid="tool-visibility"
                        >
                          {t.hidden ? <EyeOff size={13} /> : <Eye size={13} />}
                        </button>
                      )}
                    </div>
                  ))}
                  {!tools.length && (
                    <div className="hint" style={{ padding: 6 }}>
                      {set.tools.length ? 'All tools in this set are hidden.' : 'Empty set. Right-click a markup → Add to Tool Chest.'}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        <div className="hint" style={{ padding: 10 }}>
          Click a tool to start a takeoff with its subject, appearance and column values. Size tools carry the size you type (e.g. W18x35) onto every markup until you change
          it. Right-click for options, including Hide; the eye button shows hidden tools.
        </div>
      </div>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </div>
  );
}

/** Re-style selected markups with a tool's properties (Bluebeam "Apply Tool Properties"). */
export function applyToolToSelection(t: ChestTool) {
  const st = getState();
  const cols = new Map(st.doc.columns.map((c) => [c.name.toLowerCase().replace(/[^a-z0-9]/g, ''), c.id]));
  const size = t.sizeTool?.value.trim() ?? '';
  st.updateMarkups(st.selection, (m) => {
    const custom = { ...m.custom };
    for (const [k, v] of Object.entries(t.custom)) {
      const id = cols.get(k.toLowerCase().replace(/[^a-z0-9]/g, ''));
      if (id) custom[id] = v;
    }
    if (size && t.sizeTool?.setMemberSize && cols.get('membersize')) custom[cols.get('membersize')!] = size;
    return {
      ...m,
      subject: size && t.sizeTool?.setSubject ? size : t.subject,
      label: size || m.label,
      style: m.type === t.type ? { ...t.style } : { ...m.style, color: t.style.color, fillColor: m.style.fillColor ? t.style.fillColor : m.style.fillColor },
      custom,
      toolId: t.id,
      depth: m.type === 'volume' && t.depth != null ? t.depth : m.depth,
    };
  });
}
