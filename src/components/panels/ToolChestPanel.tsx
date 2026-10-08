import { useState } from 'react';
import { ChevronDown, ChevronRight, Download, FolderPlus, Plus, RotateCcw, Upload } from 'lucide-react';
import type { ChestTool, ToolSet } from '../../types';
import { getState, useStore } from '../../store/store';
import { ToolSwatch } from '../icons';
import { TYPE_INFO } from '../../core/markupTypes';
import { ContextMenu, type MenuItem } from '../ContextMenu';
import { defaultToolChest } from '../../core/defaults';
import { offerFile } from '../../store/files';
import { cmdImportToolChest } from '../../store/commands';
import { uid } from '../../core/ids';

export function ToolChestPanel() {
  const sets = useStore((s) => s.toolChest);
  const tool = useStore((s) => s.tool);
  const selection = useStore((s) => s.selection);
  const loaded = useStore((s) => s.loaded);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const st = getState;

  const activate = (t: ChestTool) => {
    if (!loaded) return;
    const cur = st().tool;
    if (cur.kind === 'markup' && cur.chestToolId === t.id) st().setTool({ kind: 'select' });
    else st().setTool({ kind: 'markup', type: t.type, chestToolId: t.id });
  };

  const toolMenu = (e: React.MouseEvent, set: ToolSet, t: ChestTool) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: 'Use Tool', onClick: () => activate(t) },
        { label: 'Properties…', onClick: () => st().setDialog({ kind: 'toolEdit', setId: set.id, toolId: t.id }) },
        { label: 'Duplicate', onClick: () => st().upsertTool(set.id, { ...structuredClone(t), id: uid('tool'), name: `${t.name} copy` }) },
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
        { label: 'Add Selected Markup as Tool', disabled: selection.length !== 1, onClick: () => st().setDialog({ kind: 'toolEdit', setId: set.id, fromMarkupId: selection[0] }) },
        { label: 'Rename', onClick: () => setRenaming(set.id) },
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

  return (
    <div className="panel" style={{ height: '100%' }}>
      <div className="panel-header">
        <span className="title">Tool Chest</span>
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
        <button className="icon-btn" title="Import tool sets" onClick={cmdImportToolChest}>
          <Upload size={14} />
        </button>
        <button
          className="icon-btn"
          title="Export tool chest"
          onClick={() => void offerFile(new Blob([JSON.stringify({ toolSets: sets }, null, 2)], { type: 'application/json' }), 'toolchest.json', 'Tool chest')}
        >
          <Download size={14} />
        </button>
        <button
          className="icon-btn"
          title="Restore default tool sets"
          onClick={() =>
            st().setDialog({
              kind: 'confirm',
              title: 'Restore Default Tool Chest',
              message: 'Replace your tool chest with the default estimating tool sets?',
              onConfirm: () => st().setToolChest(defaultToolChest()),
            })
          }
        >
          <RotateCcw size={14} />
        </button>
      </div>
      <div className="panel-body" data-testid="toolchest">
        {sets.map((set) => (
          <div className="chest-set" key={set.id}>
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
              <span className="count">{set.tools.length}</span>
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
                {set.tools.map((t) => (
                  <button
                    key={t.id}
                    className={`chest-tool${tool.kind === 'markup' && tool.chestToolId === t.id ? ' active' : ''}`}
                    onClick={() => activate(t)}
                    onDoubleClick={() => st().setDialog({ kind: 'toolEdit', setId: set.id, toolId: t.id })}
                    onContextMenu={(e) => toolMenu(e, set, t)}
                    title={`${t.name} – ${TYPE_INFO[t.type].listName}${Object.keys(t.custom).length ? '\n' + Object.entries(t.custom).map(([k, v]) => `${k}: ${v}`).join('\n') : ''}`}
                    disabled={!loaded}
                    data-testid="chest-tool"
                  >
                    <ToolSwatch tool={t} />
                    <span style={{ minWidth: 0 }}>
                      <span className="tname">{t.name}</span>
                      <span className="ttype">{TYPE_INFO[t.type].label}</span>
                    </span>
                  </button>
                ))}
                {!set.tools.length && <div className="hint" style={{ padding: 6 }}>Empty set. Right-click a markup → Add to Tool Chest.</div>}
              </div>
            )}
          </div>
        ))}
        <div className="hint" style={{ padding: 10 }}>
          Click a tool to start a takeoff with its subject, appearance and column values. Right-click for options; double-click to edit.
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
  st.updateMarkups(st.selection, (m) => {
    const custom = { ...m.custom };
    for (const [k, v] of Object.entries(t.custom)) {
      const id = cols.get(k.toLowerCase().replace(/[^a-z0-9]/g, ''));
      if (id) custom[id] = v;
    }
    return {
      ...m,
      subject: t.subject,
      style: m.type === t.type ? { ...t.style } : { ...m.style, color: t.style.color, fillColor: m.style.fillColor ? t.style.fillColor : m.style.fillColor },
      custom,
      toolId: t.id,
      depth: m.type === 'volume' && t.depth != null ? t.depth : m.depth,
    };
  });
}
