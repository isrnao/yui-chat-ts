import { usePageView, useSEO } from '@shared/hooks/useSEO';

const LEGACY_NOT_FOUND_MESSAGE =
  'The file you just requested wasn’t found in the location (or with the name) specified. You may have an incorrect URL, or the file may have been moved or renamed. Try navigating to the content you’re seeking by using the links on this page, or by searching the site with the form on this page. Most recent entries are listed below.';

export default function NotFoundPage() {
  useSEO({
    title: '４０４ＥＲＲＯＲ | ゆいちゃっとTS',
    description: '指定されたページは見つかりませんでした。',
    keywords: ['404', 'お気楽チャット', 'ゆいちゃっとTS'],
    canonical: 'https://isrnao.github.io/yui-chat-ts/404',
  });
  usePageView('404 - ゆいちゃっとTS');

  return (
    <main className="min-h-dvh bg-white px-2 py-1 font-sans text-[#222]">
      <h1 className="m-0 text-[26px] font-bold leading-tight tracking-[0.18em]">
        ４０４ＥＲＲＯＲ
      </h1>
      <h2 className="mb-2 mt-4 text-base font-bold leading-none">⌒⊂´∀｀)つ</h2>
      <div className="mb-12 text-[11px] font-bold">
        <a
          className="text-[#4c63c7] underline visited:text-[#4c63c7]"
          href={import.meta.env.BASE_URL}
        >
          お気楽チャットにもどる
        </a>
      </div>
      <p className="max-w-[980px] text-[12px] font-bold leading-[1.35]">
        {LEGACY_NOT_FOUND_MESSAGE}
      </p>
    </main>
  );
}
