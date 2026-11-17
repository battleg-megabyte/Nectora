import dns from 'dns/promises';
import net from 'net';
import path from 'path';

/**
 * Checks whether an IPv4 or IPv6 address is private, loopback, link-local, or reserved.
 */
export function isPrivateOrReservedIp(ip: string): boolean {
  if (!net.isIP(ip)) {
    return true; // Invalid IP is treated as unsafe
  }

  // IPv4 Checks
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) {
      return true;
    }

    const [a, b] = parts;

    // Loopback (127.0.0.0/8)
    if (a === 127) return true;
    // Unspecified (0.0.0.0/8)
    if (a === 0) return true;
    // Private Network 10.0.0.0/8
    if (a === 10) return true;
    // Private Network 172.16.0.0/12 (172.16 - 172.31)
    if (a === 172 && b >= 16 && b <= 31) return true;
    // Private Network 192.168.0.0/16
    if (a === 192 && b === 168) return true;
    // Link-Local & Cloud Metadata (169.254.0.0/16)
    if (a === 169 && b === 254) return true;
    // Carrier-grade NAT (100.64.0.0/10)
    if (a === 100 && b >= 64 && b <= 127) return true;
    // Documentation / Test networks (192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24)
    if (a === 192 && b === 0 && parts[2] === 2) return true;
    if (a === 198 && b === 51 && parts[2] === 100) return true;
    if (a === 203 && b === 0 && parts[2] === 113) return true;
    // Multicast & Reserved (224.0.0.0/4, 240.0.0.0/4)
    if (a >= 224) return true;

    return false;
  }

  // IPv6 Checks
  if (net.isIPv6(ip)) {
    const normalized = ip.toLowerCase();
    // Loopback
    if (normalized === '::1' || normalized === '0:0:0:0:0:0:0:1') return true;
    // Unspecified
    if (normalized === '::' || normalized === '0:0:0:0:0:0:0:0') return true;
    // Unique Local Address (fc00::/7, fd00::/8)
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
    // Link-Local (fe80::/10)
    if (normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')) return true;
    // IPv4-mapped IPv6 (::ffff:127.0.0.1 etc.)
    if (normalized.includes('::ffff:')) {
      const ipv4Part = normalized.split('::ffff:')[1];
      if (ipv4Part && net.isIPv4(ipv4Part)) {
        return isPrivateOrReservedIp(ipv4Part);
      }
    }
    return false;
  }

  return true;
}

/**
 * Validates a target URL against SSRF attacks by checking the scheme, host,
 * and performing DNS resolution to verify all resolved IPs are public.
 */
export async function validateSafeUrl(rawUrl: string): Promise<{ safe: boolean; error?: string; parsedUrl?: URL }> {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { safe: false, error: 'Empty or invalid URL.' };
  }

  // Check URL length limit (e.g. 8192 chars to support extra query params if needed)
  if (rawUrl.length > 8192) {
    return { safe: false, error: 'URL exceeds maximum length.' };
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { safe: false, error: 'Invalid URL format.' };
  }

  // Protocol validation: Strictly http: or https:
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { safe: false, error: 'Only HTTP and HTTPS protocols are permitted.' };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Strictly excluded platforms
  if (
    hostname === 'youtube.com' ||
    hostname === 'youtu.be' ||
    hostname.endsWith('.youtube.com') ||
    hostname.endsWith('.youtube-nocookie.com')
  ) {
    return { safe: false, error: 'YouTube URLs are excluded under platform policy.' };
  }

  // Explicit blacklist checks
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname === '::1'
  ) {
    return { safe: false, error: 'Access to internal or loopback hosts is prohibited.' };
  }

  // If the hostname is already an IP address, validate directly
  if (net.isIP(hostname)) {
    if (isPrivateOrReservedIp(hostname)) {
      return { safe: false, error: 'Target IP address is restricted.' };
    }
    return { safe: true, parsedUrl: parsed };
  }

  // Perform DNS resolution to inspect resolved addresses
  try {
    const addresses = await dns.lookup(hostname, { all: true });
    if (!addresses || addresses.length === 0) {
      return { safe: false, error: 'Could not resolve domain name.' };
    }

    for (const addr of addresses) {
      if (isPrivateOrReservedIp(addr.address)) {
        return { safe: false, error: 'Target resolves to a restricted network address.' };
      }
    }
  } catch (err: any) {
    return { safe: false, error: `DNS resolution failed: ${err?.message || 'Host not found'}` };
  }

  return { safe: true, parsedUrl: parsed };
}

/**
 * Sanitizes a filename to protect against path traversal and malicious characters.
 * Ensures the extension is purely the requested format (.mp4, .mp3, etc.) and never contaminated with .html.
 */
export function sanitizeFilename(rawName: string, defaultExt: string = 'mp4'): string {
  const targetExt = defaultExt.toLowerCase().replace(/^\./, '') || 'mp4';
  
  if (!rawName || typeof rawName !== 'string') {
    return `nectora_${Date.now()}.${targetExt}`;
  }

  // Remove null bytes and control chars
  let clean = rawName.replace(/[\x00-\x1f\x7f]/g, '');
  // Remove path traversal components
  clean = path.basename(clean);
  // Strip any accidental .html or .htm extensions
  clean = clean.replace(/\.html?$/i, '');
  // Strip invalid characters for file systems across Windows, Mac, Linux, Android, iOS
  clean = clean.replace(/[/\\?%*:|"<>#&{}!~;`$+=@^]/g, '_');
  // Trim spaces, underscores, and dots from ends
  clean = clean.trim().replace(/^[\s._-]+|[\s._-]+$/g, '');

  // Strip existing extension if any so we can cleanly append the exact target extension
  clean = clean.replace(/\.[a-zA-Z0-9]{1,6}$/, '');

  if (!clean) {
    clean = `nectora_${Date.now()}`;
  }

  // Ensure reasonable length (under 60 chars before ext)
  if (clean.length > 60) {
    clean = clean.slice(0, 60);
  }

  return `${clean}.${targetExt}`;
}

/**
 * Sanitizes and validates cookie strings to prevent header injection while preserving
 * standard key=value pairs, session tokens, and security cookies.
 */
export function sanitizeCookieHeader(rawCookies?: string): string {
  if (!rawCookies || typeof rawCookies !== 'string') return '';
  
  // Strip dangerous CRLF injection characters while preserving cookie key=value formatting
  const clean = rawCookies.replace(/[\r\n]/g, '').trim();
  if (clean.length > 16384) {
    return clean.slice(0, 16384);
  }
  return clean;
}

/**
 * Generates platform-specific security cookies (e.g. CSRF, device identifiers, guest sessions)
 * to ensure upstream endpoints do not block requests for missing security cookies.
 */
export function getPlatformSecurityCookies(platform: string, customCookies?: string): string {
  const custom = sanitizeCookieHeader(customCookies);

  const generateBase64Token = (length: number) => {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    let res = '';
    for (let i = 0; i < length; i++) {
      res += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    return res;
  };

  const randomHex = (len: number) =>
    Array.from({ length: len }, () => Math.floor(Math.random() * 16).toString(16)).join('');

  if (platform === 'facebook') {
    // Parse any existing cookies provided by the client/user
    const customMap = new Map<string, string>();
    if (custom) {
      custom.split(';').forEach((part) => {
        const [k, ...v] = part.trim().split('=');
        if (k) customMap.set(k.trim(), v.join('=').trim());
      });
    }

    // Required Facebook / Meta security & bot-protection cookies
    const defaults: Record<string, string> = {
      datr: generateBase64Token(24),
      sb: generateBase64Token(24),
      dpr: '2',
      wd: '1920x1080',
      ps_l: '1',
      ps_n: '1',
      locale: 'en_US',
      noscript: '1',
    };

    // User/client supplied cookies take precedence over generated defaults
    for (const [key, value] of customMap.entries()) {
      defaults[key] = value;
    }

    return Object.entries(defaults)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }

  if (platform === 'instagram') {
    const customMap = new Map<string, string>();
    if (custom) {
      custom.split(';').forEach((part) => {
        const [k, ...v] = part.trim().split('=');
        if (k) customMap.set(k.trim(), v.join('=').trim());
      });
    }

    const csrf = randomHex(32);
    const mid = `Z${randomHex(24)}`;
    const igDid = `${randomHex(8)}-${randomHex(4)}-${randomHex(4)}-${randomHex(4)}-${randomHex(12)}`.toUpperCase();
    const defaults: Record<string, string> = {
      csrftoken: csrf,
      mid: mid,
      ig_did: igDid,
      ig_nrcb: '1',
      dpr: '2',
      wd: '1920x1080',
      datr: generateBase64Token(24),
    };

    for (const [key, value] of customMap.entries()) {
      defaults[key] = value;
    }

    return Object.entries(defaults)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }

  if (platform === 'tiktok') {
    const customMap = new Map<string, string>();
    if (custom) {
      custom.split(';').forEach((part) => {
        const [k, ...v] = part.trim().split('=');
        if (k) customMap.set(k.trim(), v.join('=').trim());
      });
    }

    const defaults: Record<string, string> = {
      ttwid: `1%7C${randomHex(32)}`,
      msToken: randomHex(64),
      odin_tt: randomHex(32),
    };

    for (const [key, value] of customMap.entries()) {
      defaults[key] = value;
    }

    return Object.entries(defaults)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }

  if (platform === 'twitter' || platform === 'x') {
    const customMap = new Map<string, string>();
    if (custom) {
      custom.split(';').forEach((part) => {
        const [k, ...v] = part.trim().split('=');
        if (k) customMap.set(k.trim(), v.join('=').trim());
      });
    }

    const defaults: Record<string, string> = {
      guest_id: `v1%3A${Date.now()}`,
      personalization_id: `"v1_${Date.now()}"`,
    };

    for (const [key, value] of customMap.entries()) {
      defaults[key] = value;
    }

    return Object.entries(defaults)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }

  return custom || '';
}
