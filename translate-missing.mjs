/**
 * translate-missing.mjs
 * 
 * 批次翻譯 paulkuo-content 中缺少翻譯的文章
 * 使用 Claude API (Anthropic Sonnet 4.5)
 * 
 * 使用方式：
 *   ANTHROPIC_API_KEY=sk-... node translate-missing.mjs
 *   ANTHROPIC_API_KEY=sk-... node translate-missing.mjs --dry-run   # 只列出缺少的，不翻
 *   ANTHROPIC_API_KEY=sk-... node translate-missing.mjs --slug=faith-collapse-rebuild  # 只翻指定文章
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join, basename } from 'path';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) {
  console.error('❌ ANTHROPIC_API_KEY not set');
  process.exit(1);
}

const DRY_RUN = process.argv.includes('--dry-run');
const SLUG_FILTER = process.argv.find(a => a.startsWith('--slug='))?.split('=')[1];

const ARTICLES_DIR = join(process.cwd(), 'articles');

const LOCALES = [
  { 
    code: 'en', 
    name: 'English', 
    instructions: `Translate to natural, professional English. 
Preserve theological terms accurately (Logos, Sarx, incarnation). 
Keep technical terms precise. 
Maintain the author's intellectual voice — thoughtful, direct, with philosophical depth.
Do NOT translate proper nouns: Paul Kuo, CircleFlow, AppWorks, SDTI, etc.` 
  },
  { 
    code: 'ja', 
    name: 'Japanese', 
    instructions: `自然で知的な日本語に翻訳してください。
神学用語（ロゴス、サルクス、受肉）は正確に。
技術用語は適切なカタカナまたは漢字を使用。
文体は「だ・である」調で。
著者の知的で歯切れの良い語り口を維持してください。` 
  },
  { 
    code: 'zh-cn', 
    name: 'Simplified Chinese', 
    instructions: `转换为简体中文。注意繁体到简体的字符转换。
保持原文的思想深度和知识分子语气。
神学术语保持准确。
不要大幅改变句式结构，主要做字符层面的繁简转换和必要的用语调整（如：軟體→软件、網路→网络、品質→质量等台湾用语转为大陆用语）。` 
  },
];

async function callClaude(content, locale) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      messages: [{
        role: 'user',
        content: `You are translating a blog article for paulkuo.tw, a personal website by Paul Kuo (郭曜郎) about rebuilding order at the intersection of technology, theology, and civilization.

${locale.instructions}

CRITICAL RULES:
1. Translate the ENTIRE article including frontmatter fields: title, description
2. Keep these frontmatter fields UNCHANGED: date, pillar, tags, readingTime (copy them exactly)
3. Keep all Markdown formatting intact (headings, bold, lists, horizontal rules)
4. Keep URLs and proper nouns unchanged
5. The frontmatter must remain valid YAML between --- delimiters
6. Wrap translated title and description in double quotes in frontmatter
7. Output ONLY the translated Markdown file content — no explanations, no code fences, no preamble

Here is the article to translate:

${content}`
      }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  let text = data.content[0].text;
  
  // Strip accidental code fences
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:markdown|md)?\n?/, '').replace(/\n?```$/, '');
  }
  
  return text;
}

async function main() {
  // Get all root-level .md files (Traditional Chinese originals)
  const allArticles = readdirSync(ARTICLES_DIR)
    .filter(f => f.endsWith('.md'))
    .map(f => f.replace('.md', ''));

  // Find missing translations per locale
  const missing = {};
  let totalMissing = 0;

  for (const locale of LOCALES) {
    const localeDir = join(ARTICLES_DIR, locale.code);
    const existing = existsSync(localeDir) 
      ? readdirSync(localeDir).filter(f => f.endsWith('.md')).map(f => f.replace('.md', ''))
      : [];
    
    missing[locale.code] = allArticles.filter(slug => {
      if (SLUG_FILTER && slug !== SLUG_FILTER) return false;
      return !existing.includes(slug);
    });
    totalMissing += missing[locale.code].length;
  }

  // Report
  console.log('📊 Translation gap analysis:');
  console.log(`   Total articles: ${allArticles.length}`);
  for (const locale of LOCALES) {
    console.log(`   ${locale.name} (${locale.code}): missing ${missing[locale.code].length} translations`);
  }
  console.log(`   Total translations needed: ${totalMissing}`);

  if (DRY_RUN) {
    console.log('\n📋 Missing translations:');
    for (const locale of LOCALES) {
      if (missing[locale.code].length > 0) {
        console.log(`\n   ${locale.name}:`);
        missing[locale.code].forEach(s => console.log(`     - ${s}`));
      }
    }
    console.log('\n(dry run — no translations performed)');
    return;
  }

  if (totalMissing === 0) {
    console.log('\n✅ All translations are up to date!');
    return;
  }

  // Collect unique slugs that need any translation
  const slugsToProcess = [...new Set(
    LOCALES.flatMap(l => missing[l.code])
  )].sort();

  console.log(`\n🌐 Translating ${slugsToProcess.length} article(s)...\n`);

  let completed = 0;
  let failed = 0;

  for (const slug of slugsToProcess) {
    const sourcePath = join(ARTICLES_DIR, `${slug}.md`);
    const content = readFileSync(sourcePath, 'utf-8');
    
    console.log(`📄 [${completed + 1}/${slugsToProcess.length}] ${slug}`);

    for (const locale of LOCALES) {
      if (!missing[locale.code].includes(slug)) {
        console.log(`   ⏭️  ${locale.name}: already exists`);
        continue;
      }

      const outDir = join(ARTICLES_DIR, locale.code);
      const outFile = join(outDir, `${slug}.md`);
      
      console.log(`   → ${locale.name}...`);
      
      try {
        mkdirSync(outDir, { recursive: true });
        const translated = await callClaude(content, locale);
        writeFileSync(outFile, translated, 'utf-8');
        console.log(`   ✅ ${locale.name}`);
      } catch (err) {
        console.error(`   ❌ ${locale.name} failed: ${err.message}`);
        failed++;
      }
      
      // Rate limit: wait 65s between API calls (8000 tokens/min limit)
      console.log(`   ⏳ Waiting 65s for rate limit...`);
      await new Promise(r => setTimeout(r, 65000));
    }
    
    completed++;
  }

  console.log(`\n🎉 Done! ${completed} articles processed, ${failed} failures.`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
