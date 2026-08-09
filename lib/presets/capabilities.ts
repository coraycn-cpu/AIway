export type PresetField = {
  key: string;
  label: string;
  required?: boolean;
  example?: string;
};

export type CapabilityPreset = {
  task_code: string;
  name: string;
  description: string;
  default_model_id: string;
  temperature: number;
  max_tokens: number;
  input_schema: PresetField[];
  system_template: string;
  user_template: string;
};

export const CAPABILITY_PRESETS: CapabilityPreset[] = [
  {
    task_code: "apparel_image_enrich",
    name: "服装/面料图片分析 · 英文商品字段补全",
    description:
      "用户上传服装或面料图片后，AI 视觉分析并自动补全英文商品字段与简短描述，供服装业务站上架。",
    default_model_id: "google/gemini-2.5-flash",
    temperature: 0.3,
    max_tokens: 2500,
    input_schema: [
      {
        key: "image_url",
        label: "主图 URL",
        required: true,
        example: "https://cdn.example.com/fabric-001.jpg",
      },
      {
        key: "image_urls",
        label: "附加图片 URL 列表（可选，逗号/数组）",
        required: false,
        example: "https://cdn.example.com/detail-1.jpg",
      },
      {
        key: "category_hint",
        label: "品类提示",
        required: false,
        example: "women knitted dress / cotton fabric",
      },
      {
        key: "brand_voice",
        label: "品牌语气",
        required: false,
        example: "modern minimal wholesale apparel",
      },
      {
        key: "known_specs",
        label: "已知规格（可选 JSON/文本）",
        required: false,
        example: '{"composition":"95% cotton 5% elastane"}',
      },
    ],
    system_template: `You are a professional apparel/textile merchandising assistant for an English-language fashion or fabric business website.
Analyze the provided garment or fabric image(s) carefully.
Rules:
1) Output MUST be a single raw JSON object only. Do NOT wrap in markdown fences like \`\`\`json. No prose before/after.
2) All customer-facing text fields MUST be in natural, clear English.
3) Do not invent certifications, exact lab-tested GSM, or unavailable measurements. If unsure, use null and explain in notes.
4) Prefer commercially useful, upload-ready field values.
5) Keep short_description concise (40-80 words). Keep long_description informative but scannable (120-220 words).`,
    user_template: `Analyze the product/fabric image(s) and enrich English catalog fields.

Category hint: {{category_hint}}
Brand voice: {{brand_voice}}
Known specs (may be incomplete): {{known_specs}}
Primary image URL: {{image_url}}
Extra image URLs: {{image_urls}}

Return JSON with this shape:
{
  "title": "",
  "short_description": "",
  "long_description": "",
  "product_type": "",
  "gender": "",
  "season": "",
  "style_tags": [],
  "color_name": "",
  "color_family": "",
  "pattern": "",
  "material_guess": "",
  "fabric_hand_feel": "",
  "suggested_composition": "",
  "care_instructions": [],
  "occasions": [],
  "features": [],
  "seo_title": "",
  "seo_description": "",
  "alt_text": "",
  "confidence": 0.0,
  "notes": []
}`,
  },
  {
    task_code: "blog_topic_recommend",
    name: "博客选题推荐 · SEO/GEO 友好英文",
    description:
      "根据网站主题与目标人群，推荐易于收录的 SEO/GEO 英文博客选题，含搜索意图、关键词与内链建议。",
    default_model_id: "openai/gpt-4o-mini",
    temperature: 0.5,
    max_tokens: 2800,
    input_schema: [
      {
        key: "site_theme",
        label: "网站主题",
        required: true,
        example: "sustainable women's knitwear wholesale",
      },
      {
        key: "target_audience",
        label: "目标人群",
        required: true,
        example: "US boutique buyers and small fashion brands",
      },
      {
        key: "primary_market",
        label: "主市场/地区",
        required: false,
        example: "United States, Canada",
      },
      {
        key: "existing_topics",
        label: "已有选题/文章（避免重复）",
        required: false,
        example: "How to choose knit fabrics for summer",
      },
      {
        key: "count",
        label: "推荐数量",
        required: false,
        example: "8",
      },
      {
        key: "geo_focus",
        label: "GEO 侧重点",
        required: false,
        example: "generative engine citations, FAQ clarity, entity coverage",
      },
    ],
    system_template: `You are an SEO + GEO (Generative Engine Optimization) content strategist for English business websites.
Produce topic ideas that are useful, specific, and easy for search engines and AI answer engines to cite.
Rules:
1) Output valid JSON only.
2) Prefer informational and commercial-investigation intent that can earn rankings and AI overviews.
3) Include internal-link opportunities between topics.
4) Avoid thin/generic listicle ideas unless they have a clear angle.`,
    user_template: `Recommend English blog topics for this website.

Site theme: {{site_theme}}
Target audience: {{target_audience}}
Primary market: {{primary_market}}
GEO focus: {{geo_focus}}
Existing topics to avoid duplicating: {{existing_topics}}
How many topics: {{count}}

Return JSON:
{
  "site_positioning_summary": "",
  "topics": [
    {
      "title": "",
      "angle": "",
      "search_intent": "informational|commercial|transactional",
      "primary_keyword": "",
      "secondary_keywords": [],
      "geo_entities": [],
      "faq_seeds": [],
      "suggested_internal_links": [],
      "why_it_can_rank": "",
      "priority": "high|medium|low"
    }
  ]
}`,
  },
  {
    task_code: "blog_seo_article",
    name: "博客英文成稿 · SEO/GEO + 站内关联",
    description:
      "基于选定选题与网站主题，生成完整英文博客文章：SEO/GEO 结构、FAQ、站内内链占位，便于收录与引用。",
    default_model_id: "openai/gpt-4o",
    temperature: 0.55,
    max_tokens: 4500,
    input_schema: [
      {
        key: "site_theme",
        label: "网站主题",
        required: true,
        example: "sustainable women's knitwear wholesale",
      },
      {
        key: "target_audience",
        label: "目标人群",
        required: true,
        example: "US boutique buyers and small fashion brands",
      },
      {
        key: "topic_title",
        label: "选题标题",
        required: true,
        example: "How boutique buyers evaluate knitwear quality before wholesale orders",
      },
      {
        key: "primary_keyword",
        label: "主关键词",
        required: true,
        example: "wholesale knitwear quality checklist",
      },
      {
        key: "secondary_keywords",
        label: "次关键词",
        required: false,
        example: "knit fabric GSM, garment inspection, boutique sourcing",
      },
      {
        key: "internal_link_map",
        label: "可内链页面（标题|URL 多行）",
        required: false,
        example:
          "Fabric Care Guide|/blog/fabric-care\nMOQ Explained|/guides/moq",
      },
      {
        key: "brand_name",
        label: "品牌/站点名",
        required: false,
        example: "LeapClothes",
      },
      {
        key: "word_count",
        label: "目标字数",
        required: false,
        example: "1200",
      },
      {
        key: "cta",
        label: "文末 CTA",
        required: false,
        example: "Request fabric swatches or talk to sourcing specialists",
      },
    ],
    system_template: `You are an expert English content writer specializing in SEO and GEO (Generative Engine Optimization).
Write original, practical, citation-friendly articles for business websites.
Rules:
1) Output valid JSON only.
2) Article body in Markdown.
3) Use clear H2/H3 structure, short paragraphs, and scannable lists where helpful.
4) Include an FAQ section optimized for people also ask / AI answers.
5) Insert internal links using ONLY URLs provided in internal_link_map. Format: [anchor](url).
6) Do not fabricate statistics, certifications, or external citations.
7) Keep tone trustworthy and commercially useful, not spammy.`,
    user_template: `Write a complete English blog article.

Brand/site: {{brand_name}}
Site theme: {{site_theme}}
Target audience: {{target_audience}}
Topic title: {{topic_title}}
Primary keyword: {{primary_keyword}}
Secondary keywords: {{secondary_keywords}}
Internal link map (title|url per line): {{internal_link_map}}
Target word count: {{word_count}}
CTA: {{cta}}

Return JSON:
{
  "title": "",
  "slug_suggestion": "",
  "meta_title": "",
  "meta_description": "",
  "excerpt": "",
  "hero_outline": [],
  "article_markdown": "",
  "faq": [{"question":"","answer":""}],
  "internal_links_used": [{"anchor":"","url":""}],
  "geo_summary_paragraph": "",
  "schema_suggestions": {
    "article": true,
    "faq": true,
    "howto": false
  },
  "editor_checklist": []
}`,
  },
];
