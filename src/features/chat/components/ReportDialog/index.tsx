import { asyncResult } from '@shared/utils/asyncResult';
import { useResetOnChange } from '@shared/hooks/useResetOnChange';
import { useId, useLayoutEffect, useRef, useState } from 'react';
import Button from '@shared/components/Button';
import ModalShell from '../shared/ModalShell';
import { CHAT_TEXTS } from '@features/chat/chatTexts';
import {
  REPORT_DETAIL_MAX,
  REPORT_REASONS,
  reportChat,
  type ReportReason,
  type ReportResult,
} from '@features/chat/api/reportChat';

type Props = {
  open?: boolean;
  dialogId?: string;
  chatUuid: string;
  onClose: () => void;
  /** テストで差し替える */
  send?: typeof reportChat;
};

const RESULT_TEXT: Record<Exclude<ReportResult, 'ok'>, string> = {
  rate_limited: CHAT_TEXTS.report.rateLimited,
  not_found: CHAT_TEXTS.report.notFound,
  failed: CHAT_TEXTS.report.failed,
};

/**
 * 通報の窓（.kiro/specs/android-native-app design.md §7.6、Task 0.6、R12.2・R12.3）。理由を選び、任意で説明を足して送る。
 * 受け付けたら、そのことを示す。児童の安全に関わる理由を選んだら相談先を出す。
 */
export default function ReportDialog({
  chatUuid,
  onClose,
  send = reportChat,
  open,
  dialogId,
}: Props) {
  const titleId = useId();
  const descriptionId = useId();
  const detailId = useId();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [detail, setDetail] = useState('');
  const [state, setState] = useState<'editing' | 'sending' | ReportResult>('editing');
  const operation = useRef({ epoch: 0, busy: false });
  useLayoutEffect(() => {
    const current = operation.current;
    current.epoch++;
    current.busy = false;
    return () => {
      current.epoch++;
      current.busy = false;
    };
  }, [chatUuid, open]);
  useResetOnChange(chatUuid, () => {
    setReason(null);
    setDetail('');
    setState('editing');
  });
  useResetOnChange(open, (next) => {
    if (next === false && state === 'sending') setState('editing');
  });

  const submit = async () => {
    if (!reason || open === false || operation.current.busy) return;
    const current = operation.current;
    const epoch = current.epoch;
    current.busy = true;
    setState('sending');
    const result = await asyncResult(() => send(chatUuid, reason, detail));
    if (current.epoch !== epoch) return;
    current.busy = false;
    setState(result.ok ? result.value : 'failed');
  };

  return (
    <ModalShell
      open={open}
      dialogId={dialogId}
      role="dialog"
      labelledBy={titleId}
      describedBy={descriptionId}
      onCancel={onClose}
      className="w-full max-w-sm"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <p id={titleId} className="font-bold">
          {CHAT_TEXTS.report.title}
        </p>
        <p id={descriptionId} className="mt-1">
          {state === 'ok' ? CHAT_TEXTS.report.accepted : CHAT_TEXTS.report.description}
        </p>
        {state !== 'ok' && (
          <>
            <fieldset className="mt-2">
              <legend className="text-sm">{CHAT_TEXTS.report.reasonLabel}</legend>
              {REPORT_REASONS.map((code) => (
                <label key={code} className="flex items-center gap-1 text-sm cursor-pointer">
                  <input
                    type="radio"
                    required
                    name={`${titleId}-reason`}
                    value={code}
                    checked={reason === code}
                    onChange={() => setReason(code)}
                    disabled={state === 'sending'}
                  />
                  {CHAT_TEXTS.reportReasons[code]}
                </label>
              ))}
            </fieldset>
            <label htmlFor={detailId} className="mt-2 block text-sm">
              {CHAT_TEXTS.report.detailLabel}
            </label>
            <textarea
              id={detailId}
              value={detail}
              maxLength={REPORT_DETAIL_MAX}
              onChange={(e) => setDetail(e.target.value)}
              rows={3}
              disabled={state === 'sending'}
              className="mt-1 w-full border-2 border-ie-gray [border-style:inset] bg-white p-1 text-sm"
            />
          </>
        )}
        {reason === 'child_safety' && (
          <p className="mt-2 text-sm">
            {CHAT_TEXTS.report.childSafetyHelp}{' '}
            <a
              href={CHAT_TEXTS.report.childSafetyLinkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-700 underline"
            >
              {CHAT_TEXTS.report.childSafetyLinkLabel}
            </a>
          </p>
        )}
        {state !== 'editing' && state !== 'sending' && state !== 'ok' && (
          <p role="alert" className="mt-2 text-xs text-red-500">
            {RESULT_TEXT[state]}
          </p>
        )}
        <div className="mt-3 flex justify-end gap-2">
          {state === 'ok' ? (
            <Button type="button" onClick={onClose} autoFocus data-dialog-initial-focus>
              {CHAT_TEXTS.report.close}
            </Button>
          ) : (
            <>
              <Button type="submit" disabled={!reason || state === 'sending'}>
                {state === 'sending' ? CHAT_TEXTS.report.sending : CHAT_TEXTS.report.send}
              </Button>
              <Button type="button" onClick={onClose} autoFocus data-dialog-initial-focus>
                {CHAT_TEXTS.report.cancel}
              </Button>
            </>
          )}
        </div>
      </form>
    </ModalShell>
  );
}
