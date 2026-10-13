import { useId, useRef, useLayoutEffect, useEffectEvent, type FormEvent } from 'react';
import { useEntrySubmission } from '@shared/hooks/useEntrySubmission';
import { normalizeColorCode } from '../../utils/colorCode';
import ChanariColorPicker from '../ChanariColorPicker';
import { CHANARI_TEXTS } from '../../chanariTexts';

export type ChanariEntryFormProps = {
  name: string;
  setName: (v: string) => void;
  nameColor: string;
  setNameColor: (v: string) => void;
  speechColor: string;
  setSpeechColor: (v: string) => void;
  sid: string;
  onEnter: (args: { name: string; nameColor: string; speechColor: string }) => void | Promise<void>;
  isPending?: boolean;
  error?: string;
};

export default function ChanariEntryForm({
  name,
  setName,
  nameColor,
  setNameColor,
  speechColor,
  setSpeechColor,
  sid,
  onEnter,
  isPending = false,
  error,
}: ChanariEntryFormProps) {
  const errorId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const { ready, submit } = useEntrySubmission(isPending);
  const preserveEdited = useEffectEvent(() => {
    const form = formRef.current;
    if (!form) return;
    for (const [field, setter] of [
      ['name', setName],
      ['nameColor', setNameColor],
      ['speechColor', setSpeechColor],
    ] as const) {
      const input = form.elements.namedItem(field);
      if (input instanceof HTMLInputElement && input.value !== input.defaultValue)
        setter(input.value);
    }
  });
  useLayoutEffect(() => {
    preserveEdited();
  }, []);
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim() === '') return;
    void submit(() =>
      onEnter({
        name,
        nameColor: normalizeColorCode(nameColor, '#ff69b4'),
        speechColor: normalizeColorCode(speechColor),
      })
    );
  };

  return (
    <form
      ref={formRef}
      name="f4"
      id="main2"
      onSubmit={handleSubmit}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && (event.nativeEvent.isComposing || event.keyCode === 229))
          event.preventDefault();
      }}
      aria-busy={isPending || undefined}
    >
      <input type="hidden" name="sid" value={sid} />
      <div className="chanari-form-row">
        <label>
          {CHANARI_TEXTS.name}
          <input
            type="text"
            size={10}
            name="name"
            maxLength={20}
            aria-label={CHANARI_TEXTS.name}
            aria-describedby={error ? errorId : undefined}
            required
            pattern=".*\S.*"
            disabled={isPending}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label>
          {CHANARI_TEXTS.nameColor}
          <input
            type="text"
            size={7}
            aria-label={CHANARI_TEXTS.nameColor}
            name="nameColor"
            disabled={isPending}
            value={nameColor}
            onChange={(event) => setNameColor(event.target.value)}
          />
        </label>
        <ChanariColorPicker
          disabled={isPending}
          value={nameColor}
          onChange={setNameColor}
          ariaLabel="名前色カラーピッカー"
        />
        <label>
          {CHANARI_TEXTS.speechColor}
          <input
            type="text"
            size={7}
            aria-label={CHANARI_TEXTS.speechColor}
            name="speechColor"
            disabled={isPending}
            value={speechColor}
            onChange={(event) => setSpeechColor(event.target.value)}
          />
        </label>
        <ChanariColorPicker
          disabled={isPending}
          value={speechColor}
          onChange={setSpeechColor}
          ariaLabel="発言色カラーピッカー"
        />
      </div>
      <input type="submit" value={CHANARI_TEXTS.enter} disabled={!ready || isPending} />
      {error && (
        <div id={errorId} role="alert" className="chanari-error">
          {error}
        </div>
      )}
    </form>
  );
}
