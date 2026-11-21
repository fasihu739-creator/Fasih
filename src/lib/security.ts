import crypto from 'node:crypto';

let ephemeralFallbackKey: Buffer | null = null;

function getEncryptionKey(): Buffer {
  const configured = process.env.TOKEN_ENCRYPTION_KEY;
  if (configured && configured.trim().length > 0) {
    return crypto.createHash('sha256').update(configured).digest();
  }
  if (!ephemeralFallbackKey) {
    ephemeralFallbackKey = crypto.randomBytes(32);
  }
  return ephemeralFallbackKey;
}

export function encryptSecret(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`;
}

export function decryptSecret(ciphertext: string): string {
  const parts = ciphertext.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted secret format.');
  }
  const [ivB64, tagB64, dataB64] = parts;
  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(ivB64, 'base64')
  );
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

const SECRET_PATTERNS: Array<{ regex: RegExp; replacement: string }> = [
  { regex: /ghp_[A-Za-z0-9]{20,}/g, replacement: '[REDACTED_GITHUB_TOKEN]' },
  { regex: /github_pat_[A-Za-z0-9_]{20,}/g, replacement: '[REDACTED_GITHUB_PAT]' },
  { regex: /AIza[0-9A-Za-z\-_]{25,}/g, replacement: '[REDACTED_API_KEY]' },
  { regex: /sk-[A-Za-z0-9\-_]{20,}/g, replacement: '[REDACTED_SECRET_KEY]' },
  { regex: /AKIA[0-9A-Z]{16}/g, replacement: '[REDACTED_AWS_KEY]' },
  { regex: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, replacement: 'Bearer [REDACTED_TOKEN]' },
  {
    regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    replacement: '[REDACTED_PRIVATE_KEY]',
  },
  {
    regex: /(postgres|postgresql|mysql|mongodb):\/\/[^\s"'`]+/gi,
    replacement: '$1://[REDACTED_CREDENTIALS]',
  },
];

export function redactSecrets(input: string): string {
  let sanitized = input;
  for (const { regex, replacement } of SECRET_PATTERNS) {
    sanitized = sanitized.replace(regex, replacement);
  }
  return sanitized;
}

const INJECTION_PHRASES = [
  /ignore\s+(all\s+)?previous\s+instructions/gi,
  /disregard\s+(all\s+)?system\s+prompts?/gi,
  /reveal\s+(your\s+)?system\s+prompt/gi,
  /exfiltrate\s+secrets?/gi,
];

export function sanitizeUntrustedEngineeringText(input: string, maxLength = 6000): string {
  let clean = redactSecrets(input.slice(0, maxLength));
  for (const pattern of INJECTION_PHRASES) {
    clean = clean.replace(pattern, '[FILTERED_UNTRUSTED_DIRECTIVE]');
  }
  return clean;
}

export function isSafeExternalUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export function createSha256Hash(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}
