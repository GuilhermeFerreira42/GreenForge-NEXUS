import crypto from "crypto";

export interface LoopSignal {
  isLoop: boolean;
  tier: 'AST' | 'SIMHASH' | 'SHA256_FALLBACK';
  similarity: number;
}

export class LoopDetector {
  private history: string[] = [];

  // AST normalization (removal of identifiers and literals)
  private normalizeAST(code: string): string {
    return code
      .replace(/\b[a-z_][a-zA-Z0-9_]*\b/g, 'ID')
      .replace(/["'].*?["']/g, 'STR')
      .replace(/\d+/g, 'NUM')
      .replace(/\s+/g, '');
  }

  // SimHash of 3-shingles
  private getShingles(text: string, k = 3): string[] {
    const tokens = text.split(/\s+/).filter(Boolean);
    if (tokens.length < k) return [text];
    const shingles: string[] = [];
    for (let i = 0; i < tokens.length - k + 1; i++) {
      shingles.push(tokens.slice(i, i + k).join(' '));
    }
    return shingles;
  }

  private simHash(shingles: string[]): number {
    const bits = new Array(32).fill(0);
    for (const s of shingles) {
      const hash = parseInt(crypto.createHash('md5').update(s).digest('hex').substring(0, 8), 16);
      for (let i = 0; i < 32; i++) {
        bits[i] += (hash >> i) & 1 ? 1 : -1;
      }
    }
    let fingerprint = 0;
    for (let i = 0; i < 32; i++) {
      if (bits[i] > 0) {
        fingerprint |= (1 << i);
      }
    }
    return fingerprint;
  }

  private hammingSimilarity(a: number, b: number): number {
    let xor = (a ^ b) >>> 0;
    let diff = 0;
    while (xor) {
      diff += xor & 1;
      xor >>= 1;
    }
    return 1 - diff / 32;
  }

  public detect(code: string): LoopSignal {
    const clean = code.trim();
    if (!clean) return { isLoop: false, tier: 'SHA256_FALLBACK', similarity: 0 };

    // SHA-256 for exact match
    const sha = crypto.createHash('sha256').update(clean).digest('hex');

    // AST Fingerprint
    const astNormalized = this.normalizeAST(clean);
    const astHash = crypto.createHash('sha256').update(astNormalized).digest('hex');

    // SimHash
    const shingles = this.getShingles(clean, 3);
    const hashVal = this.simHash(shingles);

    for (const item of this.history) {
      if (item === sha) {
        return { isLoop: true, tier: 'SHA256_FALLBACK', similarity: 1.0 };
      }
      if (item === astHash) {
        return { isLoop: true, tier: 'AST', similarity: 1.0 };
      }
      if (item.startsWith('SH:')) {
        const prevHashVal = parseInt(item.substring(3), 16);
        const sim = this.hammingSimilarity(hashVal, prevHashVal);
        if (sim >= 0.92) {
          return { isLoop: true, tier: 'SIMHASH', similarity: sim };
        }
      }
    }

    // Save current hashes in history
    this.history.push(sha);
    this.history.push(astHash);
    this.history.push(`SH:${hashVal.toString(16)}`);

    if (this.history.length > 30) {
      this.history.shift();
    }

    return { isLoop: false, tier: 'SHA256_FALLBACK', similarity: 0 };
  }
}
