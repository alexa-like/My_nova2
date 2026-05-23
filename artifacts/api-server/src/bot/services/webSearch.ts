import axios from "axios";
import { logger } from "../../lib/logger.js";

export interface SearchResult {
  title: string;
  snippet: string;
  url: string;
}

function extractRealUrl(href: string): string {
  const uddgMatch = href.match(/[?&]uddg=([^&]+)/);
  if (uddgMatch) {
    try { return decodeURIComponent(uddgMatch[1]); } catch {}
  }
  if (href.startsWith("http")) return href;
  if (href.startsWith("//")) return "https:" + href;
  return href;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

async function scrapeHtmlResults(query: string): Promise<SearchResult[]> {
  const resp = await axios.post(
    "https://lite.duckduckgo.com/lite/",
    new URLSearchParams({ q: query, kl: "us-en" }).toString(),
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: "https://lite.duckduckgo.com/",
      },
      timeout: 15000,
      responseType: "text",
    }
  );

  const html = resp.data as string;
  const results: SearchResult[] = [];

  // Strategy 1: class="result-link"
  const linkPatternClass = /<a[^>]+class="result-link"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  // Strategy 2: uddg= redirect URLs
  const linkPatternUddg = /<a[^>]+href="([^"]*uddg=[^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
  // Strategy 3: any external http links in results section
  const linkPatternGeneral = /<a\s[^>]*href="(https?:\/\/(?!duckduckgo\.com)[^"]+)"[^>]*>([\s\S]*?)<\/a>/g;

  const snippetPatterns = [
    /<td[^>]*class="result-snippet"[^>]*>([\s\S]*?)<\/td>/g,
    /<span[^>]*class="result-snippet"[^>]*>([\s\S]*?)<\/span>/g,
    /<td[^>]*>([\s\S]{20,300}?)<\/td>/g,
  ];

  const links: { url: string; title: string }[] = [];
  let m: RegExpExecArray | null;

  for (const pattern of [linkPatternClass, linkPatternUddg, linkPatternGeneral]) {
    pattern.lastIndex = 0;
    while ((m = pattern.exec(html)) !== null && links.length < 8) {
      const url = extractRealUrl(m[1]);
      const title = stripHtml(m[2]);
      if (
        url.startsWith("http") &&
        !url.includes("duckduckgo.com") &&
        title.length > 2 &&
        title.length < 200 &&
        !links.some(l => l.url === url)
      ) {
        links.push({ url, title });
      }
    }
    if (links.length >= 3) break;
  }

  const snippets: string[] = [];
  for (const pattern of snippetPatterns) {
    pattern.lastIndex = 0;
    while ((m = pattern.exec(html)) !== null && snippets.length < 8) {
      const snippet = stripHtml(m[1]);
      if (snippet.length > 15 && snippet.length < 400) snippets.push(snippet);
    }
    if (snippets.length >= 3) break;
  }

  for (let i = 0; i < Math.min(links.length, 5); i++) {
    results.push({
      title: links[i].title,
      snippet: snippets[i] || links[i].title,
      url: links[i].url,
    });
  }

  return results;
}

async function instantAnswerFallback(query: string): Promise<SearchResult[]> {
  try {
    const resp = await axios.get("https://api.duckduckgo.com/", {
      params: {
        q: query,
        format: "json",
        no_html: "1",
        skip_disambig: "1",
        no_redirect: "1",
      },
      timeout: 12000,
      headers: { "User-Agent": "Nova-AI-Bot/2.0" },
    });
    const data = resp.data;
    const results: SearchResult[] = [];

    if (data.AbstractText && data.AbstractText.length > 10) {
      results.push({
        title: data.Heading || query,
        snippet: data.AbstractText,
        url: data.AbstractURL || data.AbstractSource || "",
      });
    }

    for (const r of (data.Results || []).slice(0, 3)) {
      if (r.Text && r.FirstURL) {
        results.push({
          title: r.Title || r.Text.substring(0, 80),
          snippet: r.Text,
          url: r.FirstURL,
        });
      }
    }

    for (const topic of (data.RelatedTopics || []).slice(0, 4)) {
      if (topic.Text && topic.FirstURL && !topic.Topics) {
        results.push({
          title: topic.Text.split(" - ")[0].substring(0, 80),
          snippet: topic.Text,
          url: topic.FirstURL,
        });
      }
    }

    return results.slice(0, 5);
  } catch {
    return [];
  }
}

async function ddgJsonSearch(query: string): Promise<SearchResult[]> {
  try {
    const resp = await axios.get("https://duckduckgo.com/js/spice/search/1/", {
      params: { q: query },
      timeout: 10000,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Nova-AI-Bot/2.0)",
      },
    });
    return [];
  } catch {
    return [];
  }
}

export async function webSearch(query: string): Promise<SearchResult[]> {
  try {
    const results = await scrapeHtmlResults(query);
    if (results.length > 0) {
      logger.info({ query, count: results.length }, "Web search: HTML scrape succeeded");
      return results;
    }
    logger.warn({ query }, "HTML scrape returned no results, trying instant answer API");
  } catch (err) {
    logger.warn({ err, query }, "HTML scrape failed, trying instant answer API");
  }

  const iaResults = await instantAnswerFallback(query);
  if (iaResults.length > 0) {
    logger.info({ query, count: iaResults.length }, "Web search: instant answer fallback succeeded");
    return iaResults;
  }

  logger.warn({ query }, "All web search strategies returned no results");
  return [];
}

export function formatSearchResults(query: string, results: SearchResult[]): string {
  if (results.length === 0) return `No results found for: "${query}"`;
  const lines = results.map((r, i) => {
    const title = r.title.substring(0, 80);
    const snippet = r.snippet.substring(0, 250);
    const url = r.url ? `\n🔗 ${r.url}` : "";
    return `${i + 1}. ${title}\n${snippet}${url}`;
  });
  return `🔍 Search: ${query}\n\n${lines.join("\n\n")}`;
}
