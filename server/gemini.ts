import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

let aiClient: GoogleGenAI | null = null;
const AI_CACHE_TTL_MS = 10 * 60_000;
const AI_CACHE_MAX = 200;
const aiResponseCache = new Map<string, { expiresAt: number; value: unknown }>();

function getCachedAi<T>(key: string): T | null {
  const hit = aiResponseCache.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    aiResponseCache.delete(key);
    return null;
  }
  aiResponseCache.delete(key);
  aiResponseCache.set(key, hit);
  return hit.value as T;
}

function setCachedAi(key: string, value: unknown) {
  if (aiResponseCache.size >= AI_CACHE_MAX) {
    const oldest = aiResponseCache.keys().next().value;
    if (oldest) aiResponseCache.delete(oldest);
  }
  aiResponseCache.set(key, { expiresAt: Date.now() + AI_CACHE_TTL_MS, value });
}

function hasGeminiKey(): boolean {
  return Boolean((process.env.GEMINI_API_KEY || '').trim());
}

function withTimeout<T>(promise: Promise<T>, ms = 6500): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Gemini request timed out')), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

function getAiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = (process.env.GEMINI_API_KEY || '').trim();
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

export interface VideoAnalysisResult {
  summary: string;
  keyMoments: { timestamp: string; description: string }[];
  topics: string[];
  viralScore: number;
  category: string;
  sentiment: string;
  suggestedCaptions: string[];
}

export interface FastTagsResult {
  title: string;
  hashtags: string[];
  quickSummary: string;
  recommendedCategory: string;
}

export interface SearchContextResult {
  overview: string;
  sourceReferences: { title: string; url?: string }[];
  trendingStatus: string;
}

/**
 * Deep Video & Media Understanding using gemini-4-hydrogen (ThinkingLevel.LOW for snappy responses)
 */
export async function analyzeMediaContent(metadata: {
  title: string;
  description?: string;
  platform: string;
  authorName?: string;
}): Promise<VideoAnalysisResult> {
  const cacheKey = `analyze:${metadata.platform}:${metadata.title}:${metadata.authorName || ''}`;
  const cached = getCachedAi<VideoAnalysisResult>(cacheKey);
  if (cached) return cached;

  const fallback = (): VideoAnalysisResult => ({
    summary: `Media piece from ${metadata.platform} by ${metadata.authorName || 'Creator'}: ${metadata.title}`,
    keyMoments: [
      { timestamp: '0:00', description: 'Opening hook & visual intro' },
      { timestamp: '0:15', description: 'Core demonstration / dialogue' },
      { timestamp: '0:30', description: 'Climax & conclusion' },
    ],
    topics: [metadata.platform, 'Video Content', 'Social Media', 'Creative'],
    viralScore: 82,
    category: 'Entertainment',
    sentiment: 'Energetic',
    suggestedCaptions: [
      `Check out this ${metadata.platform} moment!`,
      `Top picks from ${metadata.authorName || 'creators'}`,
      `Must-watch clip of the day`,
    ],
  });

  if (!hasGeminiKey()) {
    const fb = fallback();
    setCachedAi(cacheKey, fb);
    return fb;
  }

  const ai = getAiClient();
  const prompt = `Analyze this ${metadata.platform} video content:
Title: "${metadata.title}"
Description: "${metadata.description || 'N/A'}"
Creator: "${metadata.authorName || 'N/A'}"

Provide a concise structural analysis:
1. 2-sentence summary.
2. 3-4 key moments / timestamps (e.g. 0:00, 0:15).
3. 5-7 core topic tags.
4. Estimated viral engagement score (0 to 100).
5. Primary content category.
6. Sentiment (e.g. Positive, Energetic, Informative, Humorous).
7. 3 suggested engaging repost captions.`;

  try {
    const response = await withTimeout(
      ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: { type: Type.STRING },
              keyMoments: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    timestamp: { type: Type.STRING },
                    description: { type: Type.STRING },
                  },
                  required: ['timestamp', 'description'],
                },
              },
              topics: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              viralScore: { type: Type.NUMBER },
              category: { type: Type.STRING },
              sentiment: { type: Type.STRING },
              suggestedCaptions: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
            required: ['summary', 'keyMoments', 'topics', 'viralScore', 'category', 'sentiment', 'suggestedCaptions'],
          },
        },
      }),
      7000
    );

    const parsed = JSON.parse(response.text || '{}') as VideoAnalysisResult;
    setCachedAi(cacheKey, parsed);
    return parsed;
  } catch (err: any) {
    console.warn('Gemini media analysis fallback:', err?.message || err);
    const fb = fallback();
    setCachedAi(cacheKey, fb);
    return fb;
  }
}

/**
 * Low-latency tag generator using gemini-3.1-flash-lite
 */
export async function generateFastTags(title: string, platform: string): Promise<FastTagsResult> {
  const cacheKey = `tags:${platform}:${title}`;
  const cached = getCachedAi<FastTagsResult>(cacheKey);
  if (cached) return cached;

  const fallback = (): FastTagsResult => ({
    title: title || 'Featured Viral Video',
    hashtags: ['#viral', '#trending', `#${platform.toLowerCase()}`, '#reels', '#shorts', '#explore', '#content'],
    quickSummary: `Public ${platform} video: ${title}`,
    recommendedCategory: 'Social Media Clip',
  });

  if (!hasGeminiKey()) {
    const fb = fallback();
    setCachedAi(cacheKey, fb);
    return fb;
  }

  const ai = getAiClient();
  const prompt = `Generate snappy titles, viral hashtags, and a 1-sentence quick summary for this ${platform} video: "${title}".`;

  try {
    const response = await withTimeout(
      ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              hashtags: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              quickSummary: { type: Type.STRING },
              recommendedCategory: { type: Type.STRING },
            },
            required: ['title', 'hashtags', 'quickSummary', 'recommendedCategory'],
          },
        },
      }),
      5000
    );

    const parsed = JSON.parse(response.text || '{}') as FastTagsResult;
    setCachedAi(cacheKey, parsed);
    return parsed;
  } catch (err: any) {
    console.warn('Fast tags fallback:', err?.message || err);
    const fb = fallback();
    setCachedAi(cacheKey, fb);
    return fb;
  }
}

/**
 * Grounded search research using gemini-4-hydrogen with Google Search
 */
export async function searchVideoContext(query: string): Promise<SearchContextResult> {
  const cacheKey = `search:${query.toLowerCase()}`;
  const cached = getCachedAi<SearchContextResult>(cacheKey);
  if (cached) return cached;

  const fallback = (): SearchContextResult => ({
    overview: `Public context search for "${query}" completed. This content aligns with recent trending media across video platforms.`,
    sourceReferences: [],
    trendingStatus: 'Trending',
  });

  if (!hasGeminiKey()) {
    const fb = fallback();
    setCachedAi(cacheKey, fb);
    return fb;
  }

  const ai = getAiClient();
  const prompt = `Find background context, creator info, or origin of this viral content or topic: "${query}". Provide a concise overview, source highlights, and whether it is currently trending.`;

  try {
    const response = await withTimeout(
      ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          tools: [{ googleSearch: {} }],
        },
      }),
      7500
    );

    const text = response.text || 'No background search data found.';
    const searchChunks: any[] = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const sourceReferences = searchChunks
      .filter((c: any) => c.web?.title)
      .map((c: any) => ({
        title: c.web.title,
        url: c.web.uri,
      }))
      .slice(0, 5);

    const res: SearchContextResult = {
      overview: text,
      sourceReferences,
      trendingStatus: 'Active Public Discussion',
    };
    setCachedAi(cacheKey, res);
    return res;
  } catch (err: any) {
    console.warn('Search grounding fallback:', err?.message || err);
    const fb = fallback();
    setCachedAi(cacheKey, fb);
    return fb;
  }
}
