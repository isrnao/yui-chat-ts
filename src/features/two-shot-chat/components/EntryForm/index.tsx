import { startTransition } from 'react';
import type { Sex } from '../../../../../supabase/functions/two-shot/rules.ts';
import { NAME_MAX } from '../../../../../supabase/functions/two-shot/rules.ts';
import { TWO_SHOT_CONFIG } from '../../config';
import SexLabel from '../SexLabel';

export type EntryValues = {
  name: string;
  sex: Sex;
  /** 選んだ部屋の ID。未選択は '' */
  room: string;
  profile: string;
  /** 入力値を保存する（旧お気楽チャットの cookie のチェック） */
  save: boolean;
};

/** 旧お気楽チャットの性別は 男 / 女 の 2 つ（原作 v5.0.1 の「?」はない） */
const SEX_ORDER: readonly Sex[] = ['M', 'F'];

/** 表示されたときにハンドルネームにフォーカスする（<body onLoad="document.InputForm.chat_name.focus();">） */
function focusOnMount(element: HTMLInputElement | null) {
  element?.focus({ preventScroll: true });
}

/**
 * 待合室の入室フォーム。旧お気楽チャットのアーカイブ（2shot.php?action=Form。research.md §8）と同じ構成にする。
 * 空白は、元の HTML の改行（= 1 つの空白）の位置に置く。
 *
 * 入力は親が持つ（入室に失敗しても名前や選んだ部屋を残すため）。送信は Transition の中で親の Action に
 * FormData を渡す。<form action> にしないのは、Action の完了後に React がフォームをリセットし、満室で一覧に
 * 戻ったときなどに選んだ部屋が初期値に戻ってしまうため。旧お気楽チャットには「開設」がないので、入室は
 * いつも make = false で送る（空室に入れば待機中の管制者になる）。
 */
export default function EntryForm({
  values,
  onChange,
  action,
  homeHref,
}: {
  values: EntryValues;
  onChange: (patch: Partial<EntryValues>) => void;
  action: (formData: FormData) => void | Promise<void>;
  homeHref: string;
}) {
  return (
    <div className="ts-doc">
      {/* Quirks モードでは、小さいリンクだけの行の高さに <h1> の大きい文字の高さを含めない。ts-line-quirk で合わせる */}
      <h1 className="ts-line-quirk">
        <a href={homeHref} target="_top" style={{ fontSize: '13px', margin: 0 }}>
          {TWO_SHOT_CONFIG.siteLabel}
        </a>
      </h1>
      <h2 style={{ fontSize: '19px', marginBottom: '7px' }}>{TWO_SHOT_CONFIG.title}</h2>
      {/* 折り返したとき、チェックボックスだけの行なども同じ quirk で低くなる。文字は span に入れて行の高さを持たせる */}
      <form
        name="InputForm"
        className="ts-line-quirk"
        style={{ margin: 0 }}
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget, event.nativeEvent.submitter);
          startTransition(() => action(formData));
        }}
      >
        <span>{TWO_SHOT_CONFIG.nameLabel}</span>{' '}
        <input
          type="text"
          name="chat_name"
          aria-label={TWO_SHOT_CONFIG.nameLabel}
          size={10}
          maxLength={NAME_MAX}
          value={values.name}
          onChange={(e) => onChange({ name: e.target.value })}
          ref={focusOnMount}
        />{' '}
        {SEX_ORDER.map((sex) => (
          <label key={sex}>
            <input
              type="radio"
              name="sex"
              value={sex}
              checked={values.sex === sex}
              onChange={() => onChange({ sex })}
            />
            <SexLabel sex={sex} />{' '}
          </label>
        ))}
        <select
          name="room"
          aria-label="部屋"
          value={values.room}
          onChange={(e) => onChange({ room: e.target.value })}
        >
          <option value="">選択してください</option>
          {TWO_SHOT_CONFIG.rooms.map((room) => (
            <option key={room.id} value={room.id}>
              {room.name}
            </option>
          ))}
        </select>{' '}
        <input type="submit" value="入室" />{' '}
        <label>
          <input
            type="checkbox"
            name="cookie"
            value="1"
            checked={values.save}
            onChange={(e) => onChange({ save: e.target.checked })}
          />
          <span className="ts-small">保存</span>
        </label>
        <br />
        <span>{TWO_SHOT_CONFIG.profileLabel}</span>{' '}
        <input
          type="text"
          name="mes"
          aria-label={TWO_SHOT_CONFIG.profileLabel}
          size={50}
          maxLength={TWO_SHOT_CONFIG.profileMaxLength}
          value={values.profile}
          onChange={(e) => onChange({ profile: e.target.value })}
        />
      </form>
    </div>
  );
}
