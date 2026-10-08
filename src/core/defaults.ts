import type { ChestTool, CountSymbol, CustomColumn, Layer, MarkupStyle, MarkupType, ToolSet } from '../types';
import { defaultStyle } from './markupTypes';
import { uid } from './ids';

/** Structural-steel estimating column template (custom columns). */
export function defaultColumns(): CustomColumn[] {
  return [
    { id: 'category', name: 'Category', kind: 'choice', options: ['Structural Steel', 'Misc Metals', 'Joists & Deck', 'Concrete', 'Architectural', 'Mechanical', 'Plumbing', 'Electrical', 'General'] },
    { id: 'piece_mark', name: 'Piece Mark', kind: 'text' },
    { id: 'member_size', name: 'Member Size', kind: 'text' },
    { id: 'material', name: 'Material', kind: 'choice', options: ['Steel', 'Galvanized Steel', 'Stainless Steel', 'Aluminum', 'Concrete', 'Masonry', 'Wood', 'Other'] },
    { id: 'grade', name: 'Grade', kind: 'choice', options: ['A992', 'A36', 'A500 Gr. C', 'A572 Gr. 50', 'A53 Gr. B', 'F1554 Gr. 36', '4000 psi', '5000 psi'] },
    { id: 'qty', name: 'Qty', kind: 'number', defaultValue: '1', decimals: 0 },
    {
      id: 'weight',
      name: 'Weight',
      kind: 'formula',
      formula: 'Qty * (Length * PLF([Member Size]) + Area * PSF([Member Size]))',
      decimals: 0,
      suffix: 'lbs',
    },
    { id: 'level', name: 'Level', kind: 'choice', options: ['Foundation', 'Level 1', 'Level 2', 'Level 3', 'Roof', 'Penthouse'] },
    { id: 'grid', name: 'Grid', kind: 'text' },
    { id: 'detail', name: 'Detail', kind: 'text' },
    { id: 'connection', name: 'Connection', kind: 'choice', options: ['Shear Tab', 'Clip Angle', 'Moment', 'Bolted', 'Welded', 'Embed Plate', 'Base Plate'] },
    { id: 'labor', name: 'Labor Category', kind: 'choice', options: ['Fabricate', 'Erect', 'Fab & Erect', 'Field Install', 'Detail Only'] },
    { id: 'notes', name: 'Notes', kind: 'text' },
  ];
}

export function defaultLayers(): Layer[] {
  return [
    { id: 'layer-takeoff', name: 'Takeoff', visible: true },
    { id: 'layer-review', name: 'Review Comments', visible: true },
  ];
}

/** Default list columns (in order) that are visible. */
export const DEFAULT_VISIBLE_COLUMNS = [
  'subject',
  'type',
  'page',
  'measurement',
  'length',
  'area',
  'count',
  'c:category',
  'c:member_size',
  'c:qty',
  'c:weight',
  'c:level',
  'c:grid',
  'c:notes',
  'status',
  'color',
  'author',
];

function tool(
  name: string,
  type: MarkupType,
  color: string,
  custom: Record<string, string | number>,
  extra: Partial<MarkupStyle> & { subject?: string; depth?: number; text?: string; symbol?: CountSymbol } = {},
): ChestTool {
  const base = defaultStyle(type);
  const { subject, depth, text, ...styleExtra } = extra;
  // Measurement fills follow the tool colour; text boxes and callouts keep their white background.
  const fill = base.fillColor && base.fillColor !== '#ffffff' ? color : base.fillColor;
  return {
    id: uid(),
    name,
    type,
    subject: subject ?? name,
    depth,
    text,
    style: { ...base, color, fillColor: fill, ...styleExtra },
    layer: 'layer-takeoff',
    custom,
  };
}

const steel = (size: string, extra: Record<string, string | number> = {}) => ({
  Category: 'Structural Steel',
  'Member Size': size,
  Material: 'Steel',
  Qty: 1,
  ...extra,
});

export function defaultToolChest(): ToolSet[] {
  return [
    {
      id: uid(),
      name: 'Structural Steel',
      tools: [
        tool('W12x26', 'length', '#d7263d', steel('W12x26', { Grade: 'A992', 'Labor Category': 'Fab & Erect' }), { lineWidth: 3 }),
        tool('W18x35', 'length', '#e8112d', steel('W18x35', { Grade: 'A992', 'Labor Category': 'Fab & Erect' }), { lineWidth: 3 }),
        tool('W24x55', 'length', '#f46036', steel('W24x55', { Grade: 'A992', 'Labor Category': 'Fab & Erect' }), { lineWidth: 3.5 }),
        tool('W30x90', 'length', '#b5179e', steel('W30x90', { Grade: 'A992', 'Labor Category': 'Fab & Erect' }), { lineWidth: 4 }),
        tool('HSS6x6x3/8 Column', 'count', '#2e86de', steel('HSS6x6x3/8', { Grade: 'A500 Gr. C', 'Labor Category': 'Fab & Erect' }), {
          subject: 'HSS Column',
          symbol: 'square',
          symbolSize: 10,
        }),
        tool('HSS6x6x3/8 Beam', 'length', '#2e86de', steel('HSS6x6x3/8', { Grade: 'A500 Gr. C' }), { subject: 'HSS6x6x3/8', lineStyle: 'dashed', lineWidth: 3 }),
        tool('W10x33 Column', 'count', '#0b7a75', steel('W10x33', { Grade: 'A992' }), { subject: 'Column', symbol: 'diamond', symbolSize: 10 }),
        tool('L4x4x3/8', 'polylength', '#2a9d8f', steel('L4x4x3/8', { Grade: 'A36', Category: 'Misc Metals' }), { lineWidth: 2.5 }),
        tool('C10x15.3', 'length', '#6a4c93', steel('C10x15.3', { Grade: 'A36' }), { lineWidth: 2.5, lineStyle: 'dashed' }),
        tool('1/2" Plate', 'area', '#ff9f1c', steel('PL1/2', { Grade: 'A36', Category: 'Misc Metals' }), { fillOpacity: 0.3 }),
      ],
    },
    {
      id: uid(),
      name: 'Joists, Deck & Connections',
      tools: [
        tool('Joist 24K6', 'length', '#8338ec', steel('24K6', { Category: 'Joists & Deck', Grade: '' }), { subject: 'Joist 24K6', lineStyle: 'dashed', lineWidth: 2 }),
        tool('Metal Deck', 'area', '#3a86ff', { Category: 'Joists & Deck', Material: 'Galvanized Steel', Qty: 1, 'Member Size': '1.5B 20ga' }, { fillOpacity: 0.18 }),
        tool('Base Plate', 'count', '#ef476f', steel('PL3/4x12', { Category: 'Structural Steel', Connection: 'Base Plate' }), { symbol: 'square', symbolSize: 8 }),
        tool('Anchor Bolts', 'count', '#118ab2', { Category: 'Structural Steel', Material: 'Steel', Grade: 'F1554 Gr. 36', Qty: 4, 'Member Size': '3/4" AB' }, { symbol: 'cross', symbolSize: 8 }),
        tool('Clip Angle', 'count', '#06d6a0', steel('L4x4x3/8', { Connection: 'Clip Angle', Category: 'Misc Metals' }), { symbol: 'triangle', symbolSize: 8 }),
        tool('Embed Plate', 'count', '#9c6644', steel('PL1/2x8', { Connection: 'Embed Plate', Category: 'Misc Metals' }), { symbol: 'diamond', symbolSize: 8 }),
      ],
    },
    {
      id: uid(),
      name: 'Misc Metals',
      tools: [
        tool('Handrail', 'polylength', '#e76f51', { Category: 'Misc Metals', Material: 'Steel', Qty: 1, 'Member Size': 'Pipe 1-1/2 Std' }, { lineWidth: 3 }),
        tool('Guardrail', 'polylength', '#f4a261', { Category: 'Misc Metals', Material: 'Steel', Qty: 1 }, { lineWidth: 3, lineStyle: 'dashed' }),
        tool('Stair', 'count', '#264653', { Category: 'Misc Metals', Material: 'Steel', Qty: 1 }, { symbol: 'star', symbolSize: 12 }),
        tool('Ladder', 'count', '#2a9d8f', { Category: 'Misc Metals', Material: 'Steel', Qty: 1 }, { symbol: 'triangle', symbolSize: 10 }),
        tool('Lintel', 'length', '#bc4749', steel('L6x4x3/8', { Category: 'Misc Metals' }), { lineWidth: 2.5 }),
      ],
    },
    {
      id: uid(),
      name: 'Concrete & Sitework',
      tools: [
        tool('Slab on Grade (4")', 'volume', '#7a7a7a', { Category: 'Concrete', Material: 'Concrete', Grade: '4000 psi', Qty: 1 }, { depth: 4, subject: 'Slab on Grade' }),
        tool('Slab Area', 'area', '#6c757d', { Category: 'Concrete', Material: 'Concrete', Qty: 1 }, { subject: 'Slab Area' }),
        tool('Continuous Footing', 'polylength', '#5f6caf', { Category: 'Concrete', Material: 'Concrete', Qty: 1 }, { lineWidth: 4 }),
        tool('Spread Footing', 'count', '#495057', { Category: 'Concrete', Material: 'Concrete', Qty: 1 }, { symbol: 'square', symbolSize: 12 }),
        tool('Site Area', 'area', '#2d6a4f', { Category: 'General', Qty: 1 }, { fillOpacity: 0.15 }),
      ],
    },
    {
      id: uid(),
      name: 'Architectural & MEP',
      tools: [
        tool('Doors', 'count', '#d00000', { Category: 'Architectural', Qty: 1 }, { symbol: 'circle' }),
        tool('Windows', 'count', '#0077b6', { Category: 'Architectural', Qty: 1 }, { symbol: 'square' }),
        tool('Walls', 'polylength', '#9d4edd', { Category: 'Architectural', Qty: 1 }, { lineWidth: 4 }),
        tool('Flooring', 'area', '#ffb703', { Category: 'Architectural', Qty: 1 }, {}),
        tool('Ceiling', 'area', '#8ecae6', { Category: 'Architectural', Qty: 1 }, {}),
        tool('Floor Drains', 'count', '#023e8a', { Category: 'Plumbing', Qty: 1 }, { symbol: 'circle' }),
        tool('Light Fixtures', 'count', '#f77f00', { Category: 'Electrical', Qty: 1 }, { symbol: 'star' }),
        tool('Ductwork', 'polylength', '#2b9348', { Category: 'Mechanical', Qty: 1 }, { lineWidth: 4 }),
        tool('Piping', 'polylength', '#0096c7', { Category: 'Plumbing', Qty: 1 }, { lineWidth: 2.5 }),
        tool('Electrical Run', 'polylength', '#fb8500', { Category: 'Electrical', Qty: 1 }, { lineWidth: 2, lineStyle: 'dotted' }),
      ],
    },
    {
      id: uid(),
      name: 'Review Markups',
      tools: [
        tool('Revision Cloud', 'cloud', '#e8112d', {}, {}),
        tool('Callout', 'callout', '#e8112d', {}, {}),
        tool('Note Text', 'text', '#e8112d', {}, { subject: 'Text Box' }),
        tool('RFI Highlight', 'highlight', '#ffe600', {}, { subject: 'RFI' }),
        tool('Approved', 'stamp', '#1a8f3a', {}, { text: 'APPROVED', subject: 'Stamp' }),
        tool('Revise & Resubmit', 'stamp', '#d00000', {}, { text: 'REVISE & RESUBMIT', subject: 'Stamp' }),
      ].map((t) => ({ ...t, layer: 'layer-review' })),
    },
  ];
}
