import { useId, useLayoutEffect, useRef, useState } from 'react';
import type { Sex } from '../../../../../supabase/functions/two-shot/rules.ts';
import { TWO_SHOT_CONFIG, type AutoSeconds } from '../../config';
import ModalShell from '@features/chat/components/shared/ModalShell';
import Button from '@shared/components/Button';
import { useRetainedValue } from '@shared/hooks/useRetainedValue';
import SexLabel from '../SexLabel';
import { CONFIRM_MESSAGES } from '../../utils/confirmMessages';

const NBSP = '\u00a0';

/** 表示されたときに発言欄にフォーカスする（原作の <body onLoad="document.InputForm.Value.focus()">） */
function focusOnMount(element: HTMLInputElement | null) {
  element?.focus({ preventScroll: true });
}

const AUTO_LABELS: Record<AutoSeconds, string> = {
  0: 'なし',
  20: '自動(20秒)',
  30: '自動(30秒)',
};

/**
 * 入室後の入力画面（原作の action=ChatForm）。research.md §3.3
 *
 * 原作は操作ごとに別の <form> を送っていたが、ここでは各ボタンが親の操作を呼ぶ。発言だけは Enter キーでも
 * 送れるように <form> にする（表の外に置き、入力欄とボタンは form 属性で結びつける。表の行の中に <form> は置けない）。
 */
export default function ChatForm({
  isPending = false,
  terminal = false,
  roomName,
  me,
  seat,
  value,
  onValueChange,
  auto,
  onSay,
  onReload,
  onSetAuto,
  onClose,
  onKick,
  onLeave,
}: {
  isPending?: boolean;
  terminal?: boolean;
  roomName: string;
  me: { name: string; sex: Sex };
  seat: 0 | 1;
  value: string;
  onValueChange: (value: string) => void;
  auto: AutoSeconds;
  onSay: (text: string) => void;
  onReload: () => void;
  onSetAuto: (auto: AutoSeconds) => void;
  onClose: () => void;
  onKick: () => void;
  onLeave: () => void;
}) {
  const [confirmation, setConfirmation] = useState<'close' | 'kick' | 'leave' | null>(null);
  const displayConfirmation = useRetainedValue(confirmation);
  const armed = useRef(false);
  const titleId = useId();
  const formId = useId();
  const radioName = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);

  useLayoutEffect(() => focusOnMount(inputRef.current), []);

  // 原作の Reload(): 発言欄を空にして、その時点の自動更新の設定で取り直す
  const reload = () => {
    onValueChange('');
    onReload();
  };

  return (
    <div className="ts-doc" aria-busy={isPending || undefined}>
      <form
        id={formId}
        hidden
        onSubmit={(event) => {
          event.preventDefault();
          if (isPending) return;
          onSay(value);
          // 保存されたら親が発言欄を空にする。送れなかったときは文字が残るので、全選択して送り直せるようにする
          // （原作は送信の 0.5 秒後に、文字を残したまま全選択していた。sendTimer）
          inputRef.current?.select();
          inputRef.current?.focus();
        }}
      />
      {/* 原作は <table border=5 cellpadding=2 cellspacing=2>。罫線は待合室と同じピンクの実線にする */}
      <table className="ts-pink ts-pink-compact">
        <tbody>
          <tr>
            <td className="ts-center">
              <strong>
                《{roomName}》{'\u3000'}
              </strong>
              {me.name}(<SexLabel sex={me.sex} />)
            </td>
            <td className="ts-center">
              <input type="button" value="いつでも手動更新" disabled={isPending} onClick={reload} />
            </td>
            {seat === 0 ? (
              <>
                <td className="ts-center">
                  <input
                    type="button"
                    value=" 閉鎖 "
                    disabled={isPending || terminal}
                    onClick={(event) => {
                      if (isPending) return;
                      armed.current = true;
                      // Safari はクリックでボタンへフォーカスしない。閉じた後にここへ戻れるようにする
                      event.currentTarget.focus();
                      setConfirmation('close');
                    }}
                  />
                </td>
                <td className="ts-center">
                  <input
                    type="button"
                    value="相手を退室"
                    disabled={isPending || terminal}
                    onClick={(event) => {
                      if (isPending) return;
                      armed.current = true;
                      // Safari はクリックでボタンへフォーカスしない。閉じた後にここへ戻れるようにする
                      event.currentTarget.focus();
                      setConfirmation('kick');
                    }}
                  />
                </td>
              </>
            ) : (
              <td className="ts-center" colSpan={2}>
                <input
                  type="button"
                  value=" 退室 "
                  disabled={isPending || terminal}
                  onClick={(event) => {
                    if (isPending) return;
                    armed.current = true;
                    // Safari はクリックでボタンへフォーカスしない。閉じた後にここへ戻れるようにする
                    event.currentTarget.focus();
                    setConfirmation('leave');
                  }}
                />
              </td>
            )}
          </tr>
          <tr>
            <td className="ts-center">
              <input
                type="text"
                name="Value"
                aria-label="発言"
                size={60}
                onKeyDown={(event) => {
                  if (
                    event.key === 'Enter' &&
                    (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229)
                  )
                    event.preventDefault();
                }}
                form={formId}
                value={value}
                onChange={(event) => onValueChange(event.target.value)}
                ref={inputRef}
              />{' '}
              <input type="submit" disabled={isPending} value="発言" form={formId} />
            </td>
            <td className="ts-center" colSpan={3}>
              {NBSP}
              <fieldset className="ts-auto-options">
                <legend>自動更新</legend>
                {TWO_SHOT_CONFIG.chatReloadOptions.map((seconds, index) => (
                  <label key={seconds}>
                    {' '}
                    <input
                      type="radio"
                      name={radioName}
                      value={seconds}
                      checked={auto === seconds}
                      disabled={isPending}
                      onChange={() => {
                        if (auto !== seconds) {
                          onValueChange('');
                          onSetAuto(seconds);
                        }
                      }}
                      // 原作は onClick で Reload() する（選び直さなくても押せば取り直す）
                      onClick={() => {
                        if (auto === seconds) {
                          onValueChange('');
                          onSetAuto(seconds);
                        }
                      }}
                    />
                    {AUTO_LABELS[seconds]}
                    {index === TWO_SHOT_CONFIG.chatReloadOptions.length - 1 && NBSP}
                  </label>
                ))}
              </fieldset>
            </td>
          </tr>
        </tbody>
      </table>
      {displayConfirmation && (
        <ModalShell
          open={confirmation !== null && !terminal}
          role="alertdialog"
          labelledBy={titleId}
          onCancel={() => {
            armed.current = false;
            setConfirmation(null);
          }}
        >
          <p id={titleId}>{CONFIRM_MESSAGES[displayConfirmation]}</p>
          {/* ダイアログは all: revert の対象外なので、chat 側の確認と同じ Button で押せる見た目にする */}
          <div className="mt-3 flex justify-end gap-2">
            <Button
              type="button"
              data-dialog-initial-focus
              autoFocus
              onClick={() => {
                armed.current = false;
                setConfirmation(null);
              }}
            >
              やめる
            </Button>
            <Button
              type="button"
              disabled={isPending || terminal}
              onClick={() => {
                if (!armed.current || !confirmation || isPending || terminal) return;
                armed.current = false;
                setConfirmation(null);
                if (confirmation === 'close') onClose();
                else if (confirmation === 'kick') onKick();
                else onLeave();
              }}
            >
              実行する
            </Button>
          </div>
        </ModalShell>
      )}
      {/* 原作は <p><small>…</small>。Quirks モードの行の高さに合わせて、小さい文字のブロックにする */}
      <div className="ts-p">
        <small className="ts-small-block">
          ※ブラウザの更新(リロード)ボタンは使わないでください。
          <br />
          ※時間差により管制者(開設者)になりたい人が入室者として同時にルームに入ってしまう場合があります。
        </small>
      </div>
    </div>
  );
}
