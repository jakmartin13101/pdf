// The license (Help → License…, the badge on the menu bar, a Pro feature asked for without Pro, or – with
// no license once the trial is over – in front of the whole program): what this copy is licensed for, the
// two tiers, and where to enter a license key.
import { useRef, useState } from 'react';
import { Check, Clock, Copy, KeyRound, Lock, Minus, Monitor, Upload } from 'lucide-react';
import { getState, useAccess, useStore } from '../../store/store';
import { FEATURES, TIER_NAMES, TRIAL_DAYS, licenseSeats, type Feature } from '../../core/license';
import { PRODUCT_NAME } from '../../brand';
import { Modal } from './Modal';

/** What the tiers include, line by line. */
const ROWS: { what: string; basic: boolean; pro: boolean }[] = [
  { what: 'Measuring, counts and markups; scales and viewports', basic: true, pro: true },
  { what: 'Tool Chest, Markups List, Takeoff Summary and exports', basic: true, pro: true },
  { what: 'Standard details, maximum lengths, split view', basic: true, pro: true },
  { what: `${FEATURES.combine.name} – cut list and order list`, basic: false, pro: true },
  { what: `${FEATURES.autoTakeoff.name} – beams and tubing`, basic: false, pro: true },
];

const days = (n: number) => `${n} day${n === 1 ? '' : 's'}`;

export function LicenseDialog({ feature, locked }: { feature?: Feature; locked?: boolean }) {
  const license = useStore((s) => s.license);
  const computerId = useStore((s) => s.computerId);
  const access = useAccess();
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const st = getState();
  const tier = access.tier;
  const close = () => !locked && st.setDialog(null);

  const activate = async (text = key) => {
    if (!text.trim()) return;
    setBusy(true);
    setError('');
    const s = await st.activateLicense(text);
    setBusy(false);
    if (s.state === 'invalid') return setError(s.reason);
    if (s.state === 'expired') return setError(`This license expired on ${s.info.expires}.`);
    if (s.state !== 'valid') return;
    setKey('');
    st.toast(`${PRODUCT_NAME} ${TIER_NAMES[s.info.tier]} – licensed to ${s.info.name}`, 'success');
    // Asked for a Pro feature: carry on to it now that the license has it.
    if (feature && st.hasFeature(feature)) {
      if (feature === 'combine') st.setDialog({ kind: 'combine' });
      else {
        close();
        st.showPanel('autotakeoff');
      }
    }
  };

  const info = license.state === 'valid' || license.state === 'expired' ? license.info : null;
  return (
    <Modal
      title="License"
      icon={<KeyRound size={16} />}
      size="mid"
      onClose={close}
      closable={!locked}
      footer={
        locked ? (
          <div className="left hint">Your takeoffs are kept: they open again once the program is licensed.</div>
        ) : (
          <button className="btn primary" onClick={close}>
            Close
          </button>
        )
      }
    >
      {locked && (
        <div className="license-upsell locked" data-testid="license-locked">
          <Lock size={16} />
          <div>
            <b>Your {TRIAL_DAYS}-day trial of {PRODUCT_NAME} has ended.</b>
            <div className="hint">Enter a Basic or Pro license key to go on using the program.</div>
          </div>
        </div>
      )}
      {feature && !locked && tier !== 'pro' && (
        <div className="license-upsell" data-testid="license-upsell">
          <Lock size={16} />
          <div>
            <b>
              {FEATURES[feature].name} is part of {PRODUCT_NAME} Pro.
            </b>
            <div className="hint">{FEATURES[feature].what}. Enter a Pro license key below to use it.</div>
          </div>
        </div>
      )}
      <div className="license-status" data-testid="license-status">
        <span className={`tier-pill ${tier ?? 'none'}${access.trial ? ' trial' : ''}`} data-testid="license-tier">
          {access.trial ? 'Trial' : tier ? TIER_NAMES[tier] : 'None'}
        </span>
        <div className="grow">
          {info && license.state === 'valid' ? (
            <>
              <b data-testid="license-name">
                Licensed to {info.name}
                {info.company ? `, ${info.company}` : ''}
              </b>
              <div className="hint">
                {info.email ? `${info.email} · ` : ''}Issued {info.issued} · {info.expires ? `Expires ${info.expires}` : 'Does not expire'}
                {licenseSeats(info) ? ` · For ${licenseSeats(info)} computer${licenseSeats(info) === 1 ? '' : 's'}` : ''}
              </div>
            </>
          ) : (
            <>
              {info && license.state === 'expired' && <b className="warn-text">The license for {info.name} expired on {info.expires}. </b>}
              {license.state === 'invalid' && (
                <div className="warn-text" data-testid="license-saved-error">
                  The saved license doesn’t work here: {license.reason}
                </div>
              )}
              {access.trial ? (
                <>
                  <b data-testid="license-trial">
                    <Clock size={13} style={{ verticalAlign: -2 }} /> Basic trial – {days(access.daysLeft)} left
                  </b>
                  <div className="hint">The Basic features for {days(TRIAL_DAYS)} from the first start. Enter a Basic or Pro license key to keep using them.</div>
                </>
              ) : (
                <>
                  <b>No license</b>
                  <div className="hint">The trial is over. A Basic or Pro license key is needed.</div>
                </>
              )}
            </>
          )}
        </div>
        {license.state !== 'none' && !locked && (
          <button
            className="btn sm"
            onClick={() => {
              st.removeLicense();
              st.toast('License removed from this computer', 'info');
            }}
            data-testid="license-remove"
          >
            Remove License
          </button>
        )}
      </div>

      <table className="license-tiers">
        <thead>
          <tr>
            <th />
            <th className={tier === 'basic' ? 'mine' : ''}>Basic</th>
            <th className={tier === 'pro' ? 'mine' : ''}>Pro</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((r) => (
            <tr key={r.what}>
              <td>{r.what}</td>
              <td className={tier === 'basic' ? 'mine' : ''}>{r.basic ? <Check size={14} className="yes" /> : <Minus size={14} className="no" />}</td>
              <td className={tier === 'pro' ? 'mine' : ''}>{r.pro ? <Check size={14} className="yes" /> : <Minus size={14} className="no" />}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="field" style={{ marginTop: 12 }}>
        <label>License key</label>
        <textarea
          rows={3}
          value={key}
          placeholder="Paste your license key (it starts with BSTS1.)"
          onChange={(e) => {
            setKey(e.target.value);
            setError('');
          }}
          spellCheck={false}
          autoFocus={locked}
          data-testid="license-key"
        />
      </div>
      {error && (
        <div className="warn-text" data-testid="license-error">
          {error}
        </div>
      )}
      <div className="field-row" style={{ justifyContent: 'flex-start' }}>
        <button className="btn primary" disabled={!key.trim() || busy} onClick={() => void activate()} data-testid="license-activate">
          <KeyRound size={13} /> Activate
        </button>
        <button className="btn" onClick={() => fileRef.current?.click()} data-testid="license-file">
          <Upload size={13} /> Load License File…
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".bslicense,.txt,.lic"
          style={{ display: 'none' }}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            const text = (await f.text()).trim();
            setKey(text);
            void activate(text);
          }}
        />
      </div>
      <div className="license-computer">
        <Monitor size={14} />
        <span>This computer’s ID</span>
        <code data-testid="license-computer-id">{computerId ?? '…'}</code>
        <button
          className="icon-btn"
          title="Copy the computer ID (to send for a license tied to this computer)"
          disabled={!computerId}
          onClick={() => {
            if (!computerId) return;
            void navigator.clipboard?.writeText(computerId).catch(() => undefined);
            st.toast('Computer ID copied', 'success');
          }}
          data-testid="license-computer-copy"
        >
          <Copy size={13} />
        </button>
      </div>
      <div className="hint">
        The license is kept on this computer and checked without going online. A license for a number of computers lists their IDs and works on those only.
      </div>
    </Modal>
  );
}

/** No license and the trial over: the License window in front of the program, which waits behind it. */
export function LicenseLock() {
  return (
    <div className="license-lock" data-testid="license-lock">
      <LicenseDialog locked />
    </div>
  );
}
