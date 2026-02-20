# paulkuo-content

Content repository for [paulkuo.tw](https://paulkuo.tw)

## 目錄結構

```
articles/          # 繁體中文原文
articles/en/       # English translations
articles/ja/       # 日本語翻訳
articles/zh-cn/    # 简体中文翻译
```

## 工作流程

文章推送到此 repo 後，會透過 GitHub Actions 觸發主站 rebuild。

此 repo 與 [zarqarwi/paulkuo.tw](https://github.com/zarqarwi/paulkuo.tw)（原始碼）物理隔離，
確保程式碼更新不會影響文章內容。
