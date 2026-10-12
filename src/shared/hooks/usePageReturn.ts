import { useEffect, useEffectEvent } from 'react';
import { subscribePageReturn, type PageReturn } from '@shared/utils/pageReturn';

/** ページへ戻ったときに呼ぶ（subscribePageReturn）。onReturn の同一性が変わっても購読し直さない */
export function usePageReturn(onReturn: (info: PageReturn) => void): void {
  const handle = useEffectEvent((info: PageReturn) => onReturn(info));
  useEffect(() => subscribePageReturn((info) => handle(info)), []);
}
