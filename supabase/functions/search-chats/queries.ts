// Only placeholders and a catalog-validated schema are interpolated, never user text.
export function buildSearchQuery(schema: string, terms: number, paged: boolean) {
  if (!/^[a-z_][a-z0-9_]*$/.test(schema) || terms < 1 || terms > 5)
    throw new Error('Invalid query configuration');
  const matches = Array.from(
    { length: terms },
    (_, i) => `message OPERATOR("${schema}".&@) $${i + 4}`
  ).join(' AND ');
  const cursorIndex = 4 + terms;
  const limitIndex = cursorIndex + (paged ? 1 : 0);
  return `SELECT uuid, room_id, left(name, 256) AS name, time, left(message, 240) AS excerpt
    FROM public.chats WHERE room_id = $1 AND deleted = false AND system IS NOT TRUE
    AND time >= $2 AND time < $3 AND ${matches}
    ${paged ? `AND uuid < $${cursorIndex}::uuid` : ''}
    ORDER BY uuid DESC LIMIT $${limitIndex}`;
}
// One statement snapshot: deleted target => no context, even when neighbours exist.
export const CONTEXT_QUERY = `WITH target AS (
  SELECT uuid FROM public.chats WHERE uuid = $2::uuid AND room_id = $1
  AND deleted = false AND system IS NOT TRUE AND time >= $3 AND time < $4
), neighbours AS (
  (SELECT uuid, room_id, name, time, message FROM public.chats
    WHERE room_id = $1 AND deleted = false AND system IS NOT TRUE
    AND time >= $3 AND time < $4 AND uuid < (SELECT uuid FROM target)
    ORDER BY uuid DESC LIMIT 5)
  UNION ALL
  (SELECT uuid, room_id, name, time, message FROM public.chats
    WHERE uuid = (SELECT uuid FROM target))
  UNION ALL
  (SELECT uuid, room_id, name, time, message FROM public.chats
    WHERE room_id = $1 AND deleted = false AND system IS NOT TRUE
    AND time >= $3 AND time < $4 AND uuid > (SELECT uuid FROM target)
    ORDER BY uuid ASC LIMIT 5)
) SELECT uuid, room_id, left(name, 256) AS name, time, left(message, 240) AS excerpt
  FROM neighbours ORDER BY uuid ASC`;
