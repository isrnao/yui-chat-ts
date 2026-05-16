export function Footer() {
  return (
    <footer className="bg-blue-700 text-white">
      <div className="mx-auto grid max-w-[990px] gap-5 px-1 py-5 text-[12px] leading-7 md:grid-cols-4">
        {['チャット', '中学生チャット', 'なりきりチャット', 'オフ会'].map((title) => (
          <section key={title}>
            <h2 className="font-bold">{title}</h2>
            <ul className="text-sky-100">
              <li>○ チャットのルール・マナー</li>
              <li>○ チャットの使い方</li>
              <li>○ チャットのよくある質問</li>
            </ul>
          </section>
        ))}
        <p className="col-span-full mt-3">
          ©2026 お気楽チャットTS.
          <br />
          Inspired by 1997-2017 チャットならお気楽チャット
        </p>
      </div>
    </footer>
  );
}
