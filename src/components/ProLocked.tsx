// A Pro feature shown without Pro: what it does, and the way to the license window.
import { KeyRound, Lock } from 'lucide-react';
import { getState } from '../store/store';
import { FEATURES, type Feature } from '../core/license';
import { PRODUCT_NAME } from '../brand';
import { PanelHeader } from './dock/PanelHeader';

export function ProLocked({ feature, title }: { feature: Feature; title: string }) {
  return (
    <div className="panel" style={{ height: '100%' }}>
      <PanelHeader title={title} icon={<Lock size={14} />} />
      <div className="pro-locked" data-testid="pro-locked">
        <Lock size={26} />
        <b>
          {FEATURES[feature].name} is part of {PRODUCT_NAME} Pro
        </b>
        <span className="hint">{FEATURES[feature].what}.</span>
        <button className="btn primary" onClick={() => getState().setDialog({ kind: 'license', feature })}>
          <KeyRound size={13} /> Enter a License Key…
        </button>
      </div>
    </div>
  );
}
