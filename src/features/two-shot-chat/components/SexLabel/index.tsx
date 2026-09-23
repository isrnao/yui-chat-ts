import type { Sex } from '../../../../../supabase/functions/two-shot/rules.ts';
import { TWO_SHOT_CONFIG } from '../../config';

/** 性別の色付きの表記（原作の <font color=$color1>$sex1</font>） */
export default function SexLabel({ sex }: { sex: Sex }) {
  return (
    <span style={{ color: TWO_SHOT_CONFIG.colors.sex[sex] }}>{TWO_SHOT_CONFIG.sexLabels[sex]}</span>
  );
}
