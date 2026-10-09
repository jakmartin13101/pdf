import { useMemo } from 'react';
import { FileText } from 'lucide-react';
import termsMd from '../../../legal/terms-of-service.md?raw';
import { getState } from '../../store/store';
import { parseLegalMarkdown, splitBold } from '../../core/legal';
import { Modal } from './Modal';

function Rich({ text }: { text: string }) {
  return (
    <>
      {splitBold(text).map((part, i) => (i % 2 ? <b key={i}>{part}</b> : part))}
    </>
  );
}

export function TermsDialog() {
  const st = getState();
  const blocks = useMemo(() => parseLegalMarkdown(termsMd), []);
  const close = () => st.setDialog(null);
  return (
    <Modal
      title="Terms of Service"
      icon={<FileText size={16} />}
      size="wide"
      onClose={close}
      footer={
        <button className="btn primary" onClick={close}>
          Close
        </button>
      }
    >
      <div className="legal" data-testid="terms">
        {blocks.map((b, i) => {
          if (b.kind !== 'ul' && b.kind !== 'ol') {
            if (b.kind === 'h1') return <h2 key={i}>{b.text}</h2>;
            if (b.kind === 'h2') return <h3 key={i}>{b.text}</h3>;
            return (
              <p key={i}>
                <Rich text={b.text} />
              </p>
            );
          }
          const List = b.kind;
          return (
            <List key={i}>
              {b.items.map((it, j) => (
                <li key={j}>
                  <Rich text={it} />
                </li>
              ))}
            </List>
          );
        })}
      </div>
    </Modal>
  );
}
