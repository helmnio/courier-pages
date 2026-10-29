import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { DocumentSchema, type Script, type Block } from '../src/model.js';
import PDFDocument from 'pdfkit';
// fountain-js follows the published Fountain grammar; imports intentionally flatten emphasis.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Fountain = require('fountain-js').Fountain;
const types: Record<string, Block['type']> = {
  'Scene Heading': 'scene',
  Action: 'action',
  Character: 'character',
  Dialogue: 'dialogue',
  Parenthetical: 'parenthetical',
  Transition: 'transition',
  Shot: 'shot',
  General: 'general',
};
const names: Record<string, string> = {
  ...Object.fromEntries(Object.entries(types).map(([k, v]) => [v, k])),
  section: 'General',
};
const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export function fdx(d: Script) {
  return `<?xml version="1.0" encoding="UTF-8"?><FinalDraft DocumentType="Script" Template="No" Version="1"><Content>${d.blocks
    .filter((b) => b.type !== 'note')
    .map((b) =>
      b.type === 'pageBreak'
        ? '<Paragraph Type="Action" StartsNewPage="Yes"><Text></Text></Paragraph>'
        : `<Paragraph Type="${names[b.type] ?? 'Action'}"><Text>${escape(b.text)}</Text></Paragraph>`,
    )
    .join(
      '',
    )}</Content><TitlePage><Content><Paragraph Type="Title"><Text>${escape(d.title)}</Text></Paragraph><Paragraph Type="Author"><Text>${escape(d.author)}</Text></Paragraph></Content></TitlePage></FinalDraft>`;
}
export function parseFDX(text: string): Script {
  if (/<!DOCTYPE|<!ENTITY/i.test(text) || XMLValidator.validate(text) !== true)
    throw Error('Invalid or unsafe FDX');
  const x = new XMLParser({
    ignoreAttributes: false,
    parseTagValue: false,
    trimValues: false,
    isArray: (name) => name === 'Paragraph' || name === 'Text',
  }).parse(text).FinalDraft;
  if (!x?.Content) throw Error('Missing FDX Content');
  const value = (t: any): string => (typeof t === 'string' ? t : String(t?.['#text'] ?? ''));
  const blocks = (x.Content.Paragraph ?? []).flatMap((p: any) => {
    const t = (p.Text ?? []).map(value).join('');
    return [
      ...(p['@_StartsNewPage'] === 'Yes'
        ? [{ id: crypto.randomUUID(), type: 'pageBreak', text: '' }]
        : []),
      ...(t || p['@_StartsNewPage'] !== 'Yes'
        ? [{ id: crypto.randomUUID(), type: types[p['@_Type']] ?? 'general', text: t }]
        : []),
    ];
  });
  const titles = x.TitlePage?.Content?.Paragraph ?? [];
  return DocumentSchema.parse({
    title:
      (titles.find((p: any) => p['@_Type'] === 'Title')?.Text ?? ['Imported screenplay'])
        .map(value)
        .join('') || 'Imported screenplay',
    author: (titles.find((p: any) => p['@_Type'] === 'Author')?.Text ?? []).map(value).join(''),
    blocks,
    bible: { logline: '', characters: '', world: '', scenes: {} },
  });
}
export function fountain(d: Script) {
  let text = `Title: ${d.title}\nCredit: Written by\nAuthor: ${d.author}\n\n`;
  let prev: Block['type'] | undefined;
  for (const b of d.blocks) {
    if (b.type === 'note') continue;
    const grouped =
      (b.type === 'dialogue' || b.type === 'parenthetical') &&
      ['character', 'dialogue', 'parenthetical'].includes(prev ?? '');
    if (prev) text += grouped ? '\n' : '\n\n';
    text +=
      b.type === 'pageBreak'
        ? '==='
        : {
            scene: '.',
            action: '!',
            character: '@',
            dialogue: '',
            parenthetical: '',
            transition: '>',
            shot: '!',
            general: '!',
            note: '',
            pageBreak: '',
            section: '# ',
          }[b.type] + b.text;
    prev = b.type;
  }
  return text + '\n';
}
export function parseFountain(text: string): Script {
  const parsed = new Fountain().parse(text, true);
  const map: Record<string, Block['type']> = {
    scene_heading: 'scene',
    action: 'action',
    character: 'character',
    dialogue: 'dialogue',
    parenthetical: 'parenthetical',
    transition: 'transition',
    page_break: 'pageBreak',
    centered: 'general',
    section: 'section',
    synopsis: 'note',
    note: 'note',
  };
  let title = 'Imported screenplay',
    author = '';
  const blocks: Block[] = [];
  for (const token of parsed.tokens ?? []) {
    if (token.type === 'title') title = token.text || title;
    else if (token.type === 'author' || token.type === 'authors') author = token.text ?? '';
    else if (map[token.type])
      blocks.push({
        id: crypto.randomUUID(),
        type: map[token.type],
        text: token.type === 'page_break' ? '' : (token.text ?? ''),
      });
  }
  return DocumentSchema.parse({
    title,
    author,
    blocks,
    bible: { logline: '', characters: '', world: '', scenes: {} },
  });
}
export function pdf(d: Script) {
  const p = new PDFDocument({
    size: d.metadata.pageSize,
    margins: { top: 54, bottom: 54, left: 108, right: 72 },
    bufferPages: true,
    info: { Title: d.title, Author: d.author },
  });
  const pageWidth = p.page.width,
    pageHeight = p.page.height,
    bottom = pageHeight - 54;
  p.font('Courier').fontSize(12).lineGap(2.568);
  p.text(d.title, 108, pageHeight * 0.35, { width: pageWidth - 180, align: 'center' });
  if (d.author)
    p.text(`\nWritten by\n${d.author}`, 108, p.y, { width: pageWidth - 180, align: 'center' });
  if (d.metadata.draft > 1)
    p.text(`\n\nDraft ${d.metadata.draft}`, 108, p.y, { width: pageWidth - 180, align: 'center' });
  p.addPage();
  const offsets: Record<Block['type'], number> = {
    scene: 0,
    action: 0,
    character: 140,
    dialogue: 72,
    parenthetical: 108,
    transition: 180,
    shot: 0,
    general: 0,
    pageBreak: 0,
    note: 0,
    section: 0,
  };
  const blockPages: Record<string, number> = {};
  let cue = '';
  for (let i = 0; i < d.blocks.length; i++) {
    const b = d.blocks[i];
    if (b.type === 'note') continue;
    if (b.type === 'pageBreak') {
      p.addPage();
      continue;
    }
    const x = 108 + offsets[b.type],
      width = Math.min(
        b.type === 'dialogue' ? 250 : b.type === 'parenthetical' ? 205 : 500,
        pageWidth - 72 - x,
      );
    const options = {
      width,
      align: b.type === 'transition' ? ('right' as const) : ('left' as const),
    };
    if (b.type === 'character') {
      cue = b.text;
      const following = d.blocks[i + 1];
      const required =
        p.heightOfString(b.text, { width }) +
        (following ? Math.min(55, p.heightOfString(following.text, { width: 250 })) : 0);
      if (p.y + required > bottom) p.addPage();
    }
    if (b.type === 'scene' && p.y + 60 > bottom) p.addPage();
    blockPages[b.id] = p.bufferedPageRange().count - 1;
    // Split long dialogue at measured word boundaries and carry its cue onto the next page.
    if (b.type === 'dialogue') {
      const words = b.text.split(/\s+/);
      let line = '';
      while (words.length) {
        const trial = line + (line ? ' ' : '') + words[0];
        if (p.y + p.heightOfString(trial, options) > bottom - 18) {
          if (!line && p.heightOfString(words[0], options) > bottom - 90) {
            p.text(words.shift()!, x, p.y, options);
            continue;
          }
          if (line) p.text(line, x, p.y, options);
          p.text('(MORE)', x, p.y, { width });
          p.addPage();
          if (cue) p.text(`${cue.slice(0, 80)} (CONT'D)`, 248, p.y, { width: pageWidth - 320 });
          line = '';
        } else {
          line = trial;
          words.shift();
        }
      }
      if (line) p.text(line, x, p.y, options);
    } else p.text(b.text || ' ', x, p.y, options);
    p.moveDown(b.type === 'character' || b.type === 'parenthetical' ? 0 : 0.7);
  }
  const range = p.bufferedPageRange();
  (p as any).layout = { pages: range.count, screenplayPages: range.count - 1, blockPages };
  for (let i = 1; i < range.count; i++) {
    p.switchToPage(i);
    p.text(`${i}.`, pageWidth - 105, 30, { width: 33, lineBreak: false });
  }
  p.end();
  return p;
}
