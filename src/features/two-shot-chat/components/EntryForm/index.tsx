import { startTransition } from 'react';
import type { Sex } from '../../../../../supabase/functions/two-shot/rules.ts';
import { NAME_MAX, PROFILE_MAX } from '../../../../../supabase/functions/two-shot/rules.ts';
import { TWO_SHOT_CONFIG } from '../../config';
import SexLabel from '../SexLabel';

export type EntryValues = {
  name: string;
  sex: Sex;
  /** 選んだ部屋の ID。未選択は '' */
  room: string;
  profile: string;
  /** 入力値を保存する（原作の cookie のチェック） */
  save: boolean;
};

const SEX_ORDER: readonly Sex[] = ['M', 'F', '-'];

/** 表示されたときにフォーカスする（原作の <body onLoad="document.InputForm.….focus()">） */
function focusOnMount(element: HTMLInputElement | null) {
  element?.focus({ preventScroll: true });
}

/**
 * 入室フォーム（原作の action=Form）。research.md §3.1
 *
 * 入力は親が持つ（入室に失敗しても名前や選んだ部屋を残すため）。送信は Transition の中で親の Action に
 * FormData を渡す。<form action> にしないのは、Action の完了後に React がフォームをリセットし、満室で一覧に
 * 戻ったときなどに選んだ部屋が初期値に戻ってしまうため。「開設」は押されたボタン（name="make"）で区別する。
 */
export default function EntryForm({
  values,
  onChange,
  action,
  focus,
}: {
  values: EntryValues;
  onChange: (patch: Partial<EntryValues>) => void;
  action: (formData: FormData) => void | Promise<void>;
  /** 保存値がなければチャット名、あればプロフィールにフォーカスする */
  focus: 'name' | 'profile';
}) {
  return (
    <div className="ts-doc">
      <table className="ts-table-70">
        <tbody>
          <tr>
            <td>
              <h1>{TWO_SHOT_CONFIG.title}</h1>
              <form
                name="InputForm"
                className="ts-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  const formData = new FormData(event.currentTarget, event.nativeEvent.submitter);
                  startTransition(() => action(formData));
                }}
              >
                チャット名{' '}
                <input
                  type="text"
                  name="chat_name"
                  aria-label="チャット名"
                  size={30}
                  maxLength={NAME_MAX}
                  value={values.name}
                  onChange={(e) => onChange({ name: e.target.value })}
                  ref={focus === 'name' ? focusOnMount : undefined}
                />{' '}
                <br />
                {TWO_SHOT_CONFIG.sexName}{' '}
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
                <br />
                <select
                  name="room"
                  aria-label="ルーム"
                  value={values.room}
                  onChange={(e) => onChange({ room: e.target.value })}
                >
                  <option value="">▼ルームを選択してください</option>
                  {TWO_SHOT_CONFIG.rooms.map((room) => (
                    <option key={room.id} value={room.id}>
                      {room.name}
                    </option>
                  ))}
                </select>{' '}
                <input type="submit" value="入室" />{' '}
                <input type="submit" name="make" value="開設" />{' '}
                <span className="ts-small">
                  <label>
                    <input
                      type="checkbox"
                      name="cookie"
                      value="1"
                      checked={values.save}
                      onChange={(e) => onChange({ save: e.target.checked })}
                    />
                    保存
                  </label>
                </span>
                <br />
                プロフィール{' '}
                <input
                  type="text"
                  name="mes"
                  aria-label="プロフィール"
                  size={50}
                  maxLength={PROFILE_MAX}
                  value={values.profile}
                  onChange={(e) => onChange({ profile: e.target.value })}
                  ref={focus === 'profile' ? focusOnMount : undefined}
                />
              </form>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
