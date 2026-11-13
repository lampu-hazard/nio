import { describe, expect, it } from '@jest/globals';
import { decideSmartEmbed } from './agent-embed-decider';

describe('decideSmartEmbed', () => {
  it('rejects short casual conversational answers', () => {
    const shortText = 'Halo! Tentu saja, ada yang bisa saya bantu hari ini? Silakan tanyakan apa saja.';
    const result = decideSmartEmbed({ content: shortText, profile: 'PUBLIC', canEmbed: true });
    expect(result.shouldEmbed).toBe(false);
  });

  it('rejects text when canEmbed is false', () => {
    const structuredText = `Berikut adalah rangkuman dari artikel-artikel Tempo:
---
1. Jalur Cepat Memakzulkan Gibran Rakabuming Raka
- Tautan: https://tempo.co/read/12345
- Inti Pembahasan: Mengulas strategi anggota DPR dalam menindaklanjuti wacana pemakzulan.
---
2. Proses Pemakzulan di DPR Tetap Berjalan
- Tautan: https://tempo.co/read/67890
- Inti Pembahasan: Fraksi-fraksi di DPR mulai memetakan suara dan pandangan konstitusional.`;

    const result = decideSmartEmbed({ content: structuredText, profile: 'PUBLIC', canEmbed: false });
    expect(result.shouldEmbed).toBe(false);
  });

  it('rejects text when custom embeds are already present (e.g. action proposals)', () => {
    const structuredText = `Berikut adalah rangkuman dari artikel-artikel Tempo:
---
1. Jalur Cepat Memakzulkan Gibran Rakabuming Raka
- Tautan: https://tempo.co/read/12345
- Inti Pembahasan: Mengulas strategi anggota DPR dalam menindaklanjuti wacana pemakzulan.
---
2. Proses Pemakzulan di DPR Tetap Berjalan
- Tautan: https://tempo.co/read/67890
- Inti Pembahasan: Fraksi-fraksi di DPR mulai memetakan suara dan pandangan konstitusional.`;

    const result = decideSmartEmbed({
      content: structuredText,
      profile: 'ADMIN',
      canEmbed: true,
      hasCustomEmbeds: true,
    });
    expect(result.shouldEmbed).toBe(false);
  });

  it('rejects oversized text exceeding 4000 characters to prevent embed truncation', () => {
    const hugeText = '1. Poin penting berita terkini: ' + 'A'.repeat(4050);
    const result = decideSmartEmbed({ content: hugeText, profile: 'PUBLIC', canEmbed: true });
    expect(result.shouldEmbed).toBe(false);
  });

  it('rejects responses with dominant code blocks so users can easily copy code', () => {
    const codeResponse = `Berikut adalah kode TypeScript untuk implementasi tersebut:
\`\`\`typescript
${'const x = 1;\n'.repeat(30)}
\`\`\`
Gunakan kode di atas di dalam modul Anda.`;
    const result = decideSmartEmbed({ content: codeResponse, profile: 'PUBLIC', canEmbed: true });
    expect(result.shouldEmbed).toBe(false);
  });

  it('formats structured article summaries into a neat Discord embed', () => {
    const articleSummary = `Berikut adalah rangkuman dari artikel-artikel Tempo terkait isu wacana pemakzulan:
---
1. Jalur Cepat Memakzulkan Gibran Rakabuming Raka
- Tautan: [Tempo Politik](https://nasional.tempo.co/read/1)
- Inti Pembahasan: Mengulas strategi anggota DPR dalam menindaklanjuti wacana pemakzulan dan landasan konstitusi.
---
2. Proses Pemakzulan di DPR Tetap Berjalan
- Tautan: [Tempo Nasional](https://nasional.tempo.co/read/2)
- Inti Pembahasan: Fraksi-fraksi di parlemen mulai mengumpulkan kajian akademis dan pandangan umum.`;

    const result = decideSmartEmbed({ content: articleSummary, profile: 'PUBLIC', canEmbed: true });
    expect(result.shouldEmbed).toBe(true);
    expect(result.embed).toBeDefined();
    expect(result.embed?.title).toBe('NIO Intelligence');
    expect(result.embed?.description).toContain('Jalur Cepat Memakzulkan Gibran Rakabuming Raka');
    expect(result.embed?.color).toBe(0x5865f2);
    expect(result.embed?.footer?.text).toBe('NIO Assistant');
    expect(result.embed?.timestamp).toBeDefined();
  });

  it('extracts leading markdown header as embed title', () => {
    const textWithHeading = `# Rangkuman Berita Pemakzulan
Berikut adalah laporan lengkap dari penelusuran Tempo:
1. Poin pertama mengenai sidang paripurna DPR dan respons fraksi-fraksi.
2. Poin kedua mengenai respons pakar hukum tata negara terhadap wacana ini.
- Sumber resmi: [Tempo.co](https://tempo.co)`;

    const result = decideSmartEmbed({ content: textWithHeading, profile: 'PUBLIC', canEmbed: true });
    expect(result.shouldEmbed).toBe(true);
    expect(result.embed?.title).toBe('Rangkuman Berita Pemakzulan');
    expect(result.embed?.description.startsWith('#')).toBe(false);
    expect(result.embed?.description).toContain('Berikut adalah laporan lengkap');
  });

  it('extracts leading bold title as embed title and styles for ADMIN profile', () => {
    const textWithBold = `**Laporan Audit Keamanan Server**
Daftar temuan hasil audit sistem:
1. Audit log mendeteksi aktivitas mencurigakan pada permission role.
2. Token session dievaluasi dan memerlukan rotasi segera.
- Referensi: [Security Guideline](https://internal.sec)`;

    const result = decideSmartEmbed({ content: textWithBold, profile: 'ADMIN', canEmbed: true });
    expect(result.shouldEmbed).toBe(true);
    expect(result.embed?.title).toBe('Laporan Audit Keamanan Server');
    expect(result.embed?.color).toBe(0xed4245);
    expect(result.embed?.footer?.text).toBe('NIO Security AI');
  });
});
