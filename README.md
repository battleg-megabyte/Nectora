# NEcTORa — High-Speed Video Downloader & Media Intelligence Core

NEcTORa is a production-grade full-stack video downloader, stream proxy, and media intelligence platform engineered with React, Express, TypeScript, and Google Gemini.

## 🚀 Key Features

- **Supported Platforms**:
  - **Instagram**: Public Reels, Video Posts, IGTV
  - **TikTok**: High-Definition, No-Watermark MP4 and Audio streams
  - **Facebook**: Public Watch, Reels, and Video content
  - **Direct Media URLs**: MP4, WEBM, MOV, M3U8, and direct video CDNs
- **Resolution Fidelity**:
  - Exact 1080p Full HD, 720p HD, and 480p SD resolution matching.
  - Displays only authentic, verified native qualities without artificial resolution upscaling.
- **AI Media Intelligence**:
  - **Deep Semantic Video Analysis** (`gemini-3.1-pro-preview` / `gemini-3.7-flash`): Extracts structured summaries, key timestamps, viral engagement scores, and repost captions.
  - **Low-Latency Response Engine** (`gemini-3.1-flash-lite`): Instant viral hashtag and SEO summary generation.
  - **Google Search Grounding** (`gemini-3.5-flash` / `gemini-3.7-flash`): Real-time web contextualization, audio origins, and trending discussions.
- **SSRF & Privacy Defense**:
  - Full DNS IP validation blocking loopback (127.0.0.1, ::1), RFC1918 private subnets, and cloud metadata (169.254.169.254).
  - Strict filename sanitization against path traversal.
  - In-memory chunked streaming with zero persistent video logging.
  - Automated temporary file lifecycle sweeping.
- **Strict Compliance**:
  - YouTube is strictly excluded.

## 🛠️ Architecture

```
Frontend (React 19 + Tailwind CSS + Lucide Icons)
      ↓
Express Backend (port 3000)
      ↓
Rate Limiter & SSRF Security Layer
      ↓
Platform Detector & Adapters (Instagram, TikTok, Facebook, Direct)
      ↓
Media Analysis & Prober
      ↓
Streaming Proxy & Download Pipeline
      ↓
Gemini Intelligence Hub (@google/genai)
```

## 💻 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
```
Ensure `GEMINI_API_KEY` is provided.

### 3. Run Development Server
```bash
npm run dev
```

### 4. Build for Production
```bash
npm run build
npm start
```
