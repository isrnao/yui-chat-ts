// 通報の入力の規則（.kiro/specs/android-native-app design.md §7.6、Task 0.6）。
// save-chat の schema.ts と同じく import を持たない。Web と Android 版は理由の一覧を contracts（chat-texts.json の
// report.reasons）で読む。理由の一覧は migration 20261012000000_chat_reports.sql の CHECK と同じにする。

/** 通報の理由。child_safety は運営にすぐ知らせる（児童の性的虐待と搾取など） */
export const REPORT_REASONS = [
  'spam',
  'harassment',
  'sexual',
  'child_safety',
  'personal_info',
  'other',
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

/** 説明の上限（文字。コードポイントで数える） */
export const REPORT_DETAIL_MAX = 500;

/** 同じ IP（信頼できる位置のもの）・同じ端末の鍵から 1 時間に受ける通報の数 */
export const REPORT_LIMIT_PER_HOUR = 10;

/** 全体で 1 時間に受ける通報の数（IP と端末の鍵を変えながら送られても止める） */
export const REPORT_GLOBAL_LIMIT_PER_HOUR = 300;

export type ReportErrorCode =
  | 'invalid_json'
  | 'invalid_chat_uuid'
  | 'invalid_reason'
  | 'invalid_detail';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ReportInput {
  chatUuid: string;
  reason: ReportReason;
  detail: string;
}

export function isReportReason(value: unknown): value is ReportReason {
  return typeof value === 'string' && (REPORT_REASONS as readonly string[]).includes(value);
}

/** 本文（JSON を読んだもの）を確かめる。合わなければ誤りのコード */
export function checkReport(body: unknown): ReportInput | { error: ReportErrorCode } {
  if (typeof body !== 'object' || body === null || Array.isArray(body))
    return { error: 'invalid_json' };
  const { chat_uuid: chatUuid, reason, detail } = body as Record<string, unknown>;
  if (typeof chatUuid !== 'string' || !UUID.test(chatUuid)) return { error: 'invalid_chat_uuid' };
  if (!isReportReason(reason)) return { error: 'invalid_reason' };
  if (detail !== undefined && detail !== null && typeof detail !== 'string')
    return { error: 'invalid_detail' };
  const text = (detail ?? '').trim();
  if ([...text].length > REPORT_DETAIL_MAX) return { error: 'invalid_detail' };
  return { chatUuid: chatUuid.toLowerCase(), reason, detail: text };
}
