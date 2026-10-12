import { supabase } from '@shared/supabaseClient';
import { getAuthorKey } from '../utils/authorKey';
import type { ReportReason } from '../../../../supabase/functions/report-chat/schema.ts';

export type { ReportReason } from '../../../../supabase/functions/report-chat/schema.ts';
export {
  REPORT_DETAIL_MAX,
  REPORT_REASONS,
} from '../../../../supabase/functions/report-chat/schema.ts';

/** 通報の結果。ok 以外は画面で文言を出す */
export type ReportResult = 'ok' | 'rate_limited' | 'not_found' | 'failed';

/**
 * 発言を運営に通報する（Edge Function report-chat、Task 0.6）。書いた端末の鍵を付ける（同じ端末からの通報の数を
 * 数えるため。サーバーはハッシュで残す）。失敗は投げずに結果で返す。
 */
export async function reportChat(
  chatUuid: string,
  reason: ReportReason,
  detail: string
): Promise<ReportResult> {
  const { error } = await supabase.functions.invoke('report-chat', {
    body: { chat_uuid: chatUuid, reason, detail },
    headers: { 'x-chat-author-key': getAuthorKey() },
  });
  if (!error) return 'ok';
  const context = (error as { context?: unknown }).context;
  if (context instanceof Response) {
    if (context.status === 429) return 'rate_limited';
    if (context.status === 404) return 'not_found';
  }
  return 'failed';
}
