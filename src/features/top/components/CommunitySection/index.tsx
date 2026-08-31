import { AdringWidget } from '../AdringWidget';
import { SectionTitle } from '../SectionTitle';

/** お気楽チャットTS の Adring サイト ID */
const ADRING_SITE_ID = '8405936a-90fd-449d-a64e-54c0e15a4073';

/**
 * トップページ最下部のコミュニティー欄。
 * 3 カラムグリッドの外 (= PC では歴史的チャットの下、SP では
 * チャットのルール・マナーの下) に全幅で並ぶ。
 */
export function CommunitySection() {
  return (
    <section id="community" className="bg-white">
      <SectionTitle>コミュニティー</SectionTitle>
      <div className="flex flex-wrap gap-3 px-2 py-2">
        {/*
          広告が取得できない場合、widget は自身が生成した host のみを display:none にする。
          見出しは widget の管理外なので、在庫なしでもこの h3 だけが残る。
        */}
        <div className="w-full max-w-[356px]">
          <h3 className="text-[13px] font-bold leading-tight text-gray-800">Adring</h3>
          <AdringWidget siteId={ADRING_SITE_ID} variant="compact" className="mt-1" />
        </div>
      </div>
    </section>
  );
}
