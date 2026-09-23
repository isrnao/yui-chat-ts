import { useState } from 'react';
import { useStoreBackedState } from '@shared/hooks/useStoreBackedState';
import type { AvatarId } from '@features/chat/types';

export type ChatIdentityDefaults = {
  name?: string;
  color?: string;
  email?: string;
  avatar?: AvatarId;
};

/**
 * 入室者の名前・色・メール・アバター（Chat_Identity）。
 * 既定値は呼び出し元が永続化ストア（settingsStore やちゃなりの下書き）から渡す。
 * SSG / hydration 中は既定値を使い、hydration 後はストアの値に追随する。編集後は編集した値を優先する。
 */
export function useChatIdentity(defaults: ChatIdentityDefaults) {
  const [name, setName] = useStoreBackedState(defaults.name ?? '');
  const [color, setColor] = useStoreBackedState(defaults.color || '#ff69b4');
  const [email, setEmail] = useStoreBackedState(defaults.email ?? '');
  // アバターは入室フォームの選択を入室時に受け取るだけなので、ストアには追随しない
  const [avatar, setAvatar] = useState<AvatarId>(() => defaults.avatar ?? 'none');
  return { name, setName, color, setColor, email, setEmail, avatar, setAvatar };
}

export type ChatIdentity = ReturnType<typeof useChatIdentity>;
