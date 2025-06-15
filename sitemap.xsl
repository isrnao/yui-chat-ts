<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform" xmlns:sm="http://www.sitemaps.org/schemas/sitemap/0.9">
  <xsl:output method="html" version="1.0" encoding="UTF-8" indent="yes"/>
  
  <xsl:template match="/">
    <html>
      <head>
        <title>サイトマップ - ゆいちゃっと</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f8f9fa;
          }
          h1 {
            color: #333;
            text-align: center;
            margin-bottom: 30px;
          }
          .sitemap-info {
            background: white;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 20px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          table {
            width: 100%;
            border-collapse: collapse;
            background: white;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          th {
            background: #f1f3f4;
            padding: 12px;
            text-align: left;
            font-weight: 600;
            border-bottom: 1px solid #dee2e6;
          }
          td {
            padding: 12px;
            border-bottom: 1px solid #dee2e6;
          }
          tr:last-child td {
            border-bottom: none;
          }
          a {
            color: #007bff;
            text-decoration: none;
          }
          a:hover {
            text-decoration: underline;
          }
          .priority {
            font-weight: bold;
          }
          .changefreq {
            text-transform: capitalize;
          }
        </style>
      </head>
      <body>
        <h1>サイトマップ</h1>
        
        <div class="sitemap-info">
          <p>このサイトマップには、検索エンジンがクロールできるページのリストが含まれています。</p>
          <p>総ページ数: <strong><xsl:value-of select="count(sm:urlset/sm:url)"/></strong></p>
        </div>
        
        <table>
          <thead>
            <tr>
              <th>URL</th>
              <th>最終更新日</th>
              <th>更新頻度</th>
              <th>優先度</th>
            </tr>
          </thead>
          <tbody>
            <xsl:for-each select="sm:urlset/sm:url">
              <tr>
                <td>
                  <a href="{sm:loc}">
                    <xsl:value-of select="sm:loc"/>
                  </a>
                </td>
                <td>
                  <xsl:value-of select="sm:lastmod"/>
                </td>
                <td class="changefreq">
                  <xsl:value-of select="sm:changefreq"/>
                </td>
                <td class="priority">
                  <xsl:value-of select="sm:priority"/>
                </td>
              </tr>
            </xsl:for-each>
          </tbody>
        </table>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>
