import { useCallback, useEffect, useRef, useState, useOptimistic } from 'react';
import { loadChatLogs, subscribeChatLogs } from '@features/chat/api/chatApi';
import type { RealtimeStatus } from '@features/chat/api/chatApi';
import { mergeChatLogByUuid } from '@features/chat/utils/aggregatedLog';
import { useResetOnChange } from '@shared/hooks/useResetOnChange';
import type { Chat } from '@features/chat/types';
import { DEFAULT_ROOM_ID, type RoomId } from '@features/chat/rooms';

function isSavedMatchForTemp(saved: Chat, temp: Chat): boolean {
  // 強い鍵: optimisticNonce が両側で揃っていれば、ユーザー間 / メッセージ間衝突なく一致判定できる。
  const tempNonce = temp.metadata?.optimisticNonce;
  const savedNonce = saved.metadata?.optimisticNonce;
  if (tempNonce && savedNonce) {
    return saved.optimistic !== true && tempNonce === savedNonce;
  }

  // 後方互換フォールバック: nonce 未付与の旧データ向け。
  // client_time が両側で数値であることを必須にし、未設定行同士 (undefined === undefined) で
  // 全く別メッセージが誤一致するのを防ぐ。
  if (typeof temp.client_time !== 'number' || typeof saved.client_time !== 'number') {
    return false;
  }
  return (
    saved.optimistic !== true &&
    saved.client_time === temp.client_time &&
    saved.name === temp.name &&
    saved.message === temp.message &&
    saved.room_id === temp.room_id &&
    saved.color === temp.color &&
    Boolean(saved.system) === Boolean(temp.system)
  );
}

export function reduceOptimisticChat(state: Chat[], chat: Chat): Chat[] {
  // temp UUID の楽観的更新は、対応する savedChat が
  // 既に base state に届いている場合は重複表示を避けるためスキップする
  if (chat.uuid.startsWith('temp-')) {
    const duplicate = state.some((c) => isSavedMatchForTemp(c, chat));
    if (duplicate) {
      return state;
    }
  }

  const index = state.findIndex((c) => c.uuid === chat.uuid);
  if (index !== -1) {
    const next = [...state];
    next[index] = chat;
    return next.slice(0, 2000);
  }
  return [chat, ...state].slice(0, 2000);
}

export function useChatLog(
  roomId: RoomId = DEFAULT_ROOM_ID,
  onRealtimeChat?: (chat: Chat) => void
) {
  const [chatLog, setChatLog] = useState<Chat[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // 「更新」ごとにインクリメントして取得 effect を再実行させる
  const [reloadKey, setReloadKey] = useState(0);
  // Realtime の接続状態。push が届かない間のフォールバック判断に使う
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>('connecting');

  // roomId 変更時は reload 開始状態へ巻き戻す (useResetOnChange = 公式推奨「前回値検知」パターン)
  useResetOnChange(roomId, () => {
    setChatLog([]);
    setIsLoading(true);
    setReloadKey(0);
    setRealtimeStatus('connecting');
  });

  // mergeChat / handleRealtimeStatus は下の購読 effect の依存に入る。React Compiler も
  // 同等にメモ化するが、同一性が変わると channel を張り直すことになるため、
  // 要件を明示して useCallback を残す。
  const mergeChat = useCallback((chat: Chat) => {
    setChatLog((prev) => mergeChatLogByUuid(prev, chat));
  }, []);

  // 直前の接続状態。connected への「遷移」だけを検知するために保持する
  const lastRealtimeStatusRef = useRef<RealtimeStatus>('connecting');

  const handleRealtimeStatus = useCallback((status: RealtimeStatus) => {
    const previous = lastRealtimeStatusRef.current;
    lastRealtimeStatusRef.current = status;
    setRealtimeStatus(status);

    // 接続が確立した時点で一度だけ取り直して、push が届いていなかった間の穴を塞ぐ。
    //
    // subscribeChatLogs は SUBSCRIBED を待たずに返るため、初回は
    // 「snapshot がサーバーで確定した時刻」から「SUBSCRIBED 到達」までに INSERT された
    // 発言が snapshot にもバッファにも入らない。再接続時も同様に、切れていた間の発言が
    // push されない (Postgres Changes は再購読時に取りこぼしを配送しない)。
    //
    // 取得の開始自体は SUBSCRIBED を待たない。待たせると毎回のマウントで初回描画が
    // websocket のハンドシェイク待ちになるため、描画は従来どおり即時に始め、
    // 接続確立後の取り直しで穴を埋める。
    if (status === 'connected' && previous !== 'connected') {
      setReloadKey((k) => k + 1);
    }
  }, []);

  /**
   * 明示的な再読み込み。TTL キャッシュを迂回してサーバーから取り直す。
   * 他ユーザーの発言は Realtime でしか届かず resource キャッシュには反映されないため、
   * キャッシュ付きで取り直すと直近の発言がログから消えてしまう。
   */
  const reload = () => setReloadKey((k) => k + 1);

  const [optimisticLog, addOptimistic] = useOptimistic(chatLog, reduceOptimisticChat);

  // 取得中に Realtime で届いた発言を退避するバッファ。取得結果でそのまま置換すると
  // 先着した新着発言が消えるため、取得の完了時にマージする。
  // 購読 effect と取得 effect にまたがるので ref で共有する。
  const arrivedDuringLoadRef = useRef<Chat[] | null>(null);

  // 購読は roomId 単位で張りっぱなしにする。reloadKey を依存に入れて取得と同じ
  // effect にまとめると、更新のたびに（ちゃなりの定期更新では既定 7 秒ごとに）
  // room で共有している唯一の channel を破棄・再作成することになる。
  // subscribeChatLogs は SUBSCRIBED を待たずに返るため、その再接続中に INSERT
  // された発言は snapshot にもバッファにも入らず取りこぼす。
  useEffect(() => {
    // ref は「この購読における直前の状態」なので、購読を張り直すたびに初期化する
    lastRealtimeStatusRef.current = 'connecting';

    const channel = subscribeChatLogs(
      roomId,
      (chat) => {
        onRealtimeChat?.(chat);
        arrivedDuringLoadRef.current?.push(chat);
        mergeChat(chat);
      },
      handleRealtimeStatus
    );
    return () => {
      channel.unsubscribe();
    };
  }, [handleRealtimeStatus, mergeChat, onRealtimeChat, roomId]);

  // 取得のみ reloadKey で再実行する。購読 effect より後に宣言することで、
  // マウント時・roomId 変更時は必ず購読の確立を先に始める。
  useEffect(() => {
    let ignore = false;
    const buffer: Chat[] = [];
    arrivedDuringLoadRef.current = buffer;

    const stopBuffering = () => {
      if (arrivedDuringLoadRef.current === buffer) arrivedDuringLoadRef.current = null;
    };

    loadChatLogs(roomId, reloadKey === 0)
      .then((logs) => {
        if (ignore) return;
        // 取得結果を canonical としつつ、取得中に届いた発言は落とさない
        setChatLog(mergeChatLogByUuid(logs, buffer));
      })
      .finally(() => {
        stopBuffering();
        if (!ignore) setIsLoading(false);
      });

    return () => {
      ignore = true;
      stopBuffering();
    };
  }, [roomId, reloadKey]);

  return {
    chatLog: optimisticLog,
    isLoading,
    realtimeStatus,
    setChatLog,
    addOptimistic,
    mergeChat,
    reload,
  };
}
