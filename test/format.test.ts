import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { parseJson3 } from '../src/extractor/parsers.ts';
import { formatTimestamp, transcriptFile, transcriptFilename, transcriptToParagraphs, transcriptToText } from '../src/format.ts';

const zoo = parseJson3(readFileSync(new URL('./fixtures/json3-manual-en.json', import.meta.url), 'utf8'));
const asr = parseJson3(readFileSync(new URL('./fixtures/json3-asr-en.json', import.meta.url), 'utf8'));

describe('timestamps', () => {
  it('formatTimestamp', () => {
    assert.equal(formatTimestamp(0), '0:00');
    assert.equal(formatTimestamp(1_999), '0:01');
    assert.equal(formatTimestamp(75_000), '1:15');
    assert.equal(formatTimestamp(3_725_000), '1:02:05');
    assert.equal(formatTimestamp(65_000, true), '0:01:05');
    assert.equal(formatTimestamp(-5), '0:00');
  });

});

describe('export', () => {
  it('with timestamps: paragraphs, each starting with its first caption time', () => {
    // Short clip, no pause or speaker change: one paragraph.
    assert.equal(transcriptToText(zoo, true), `[0:01] ${zoo.map((s) => s.text).join(' ')}`);
    const asrParagraphs = transcriptToText(asr, true).split('\n\n');
    assert.equal(asrParagraphs[0], '[0:00] Deepest secret.');
    assert.equal(asrParagraphs[1], '[0:01] >> Energy.');
    assert.ok(asrParagraphs[2]!.startsWith('[0:02] >> Wait, that could actually work.'));
  });

  it('with timestamps: shorter paragraphs than plain text', () => {
    const seg = (startMs: number, text: string) => ({ startMs, durMs: 1000, text });
    const sentence = `${'y'.repeat(200)}.`;
    const segs = [seg(0, sentence), seg(1000, 'b.'), seg(2000, 'c.')];
    assert.equal(transcriptToText(segs, true), `[0:00] ${sentence}\n\n[0:01] b. c.`);
    assert.equal(transcriptToText(segs, false), `${sentence} b. c.`);
  });

  it('without timestamps joins captions into flowing paragraphs', () => {
    // No pause of 2 s or more and no speaker change in this clip: one paragraph.
    assert.equal(transcriptToText(zoo, false), zoo.map((s) => s.text).join(' '));
  });

  it('without timestamps keeps every word, in order', () => {
    const words = (s: string) => s.split(/\s+/).filter(Boolean);
    assert.deepEqual(words(transcriptToText(asr, false)), words(asr.map((s) => s.text).join(' ')));
  });

  it('starts a new paragraph at a speaker change', () => {
    const paragraphs = transcriptToParagraphs(asr);
    assert.equal(paragraphs[0], 'Deepest secret.');
    assert.equal(paragraphs[1], '>> Energy.');
    assert.ok(paragraphs[2]!.startsWith('>> Wait, that could actually work.'));
  });

  it('starts a new paragraph after a long pause, or at a sentence end once long', () => {
    const seg = (startMs: number, text: string, durMs = 1000) => ({ startMs, durMs, text });
    assert.deepEqual(transcriptToParagraphs([seg(0, 'one'), seg(1000, 'two'), seg(5000, 'three')]), ['one two', 'three']);
    const long = 'x'.repeat(500);
    assert.deepEqual(transcriptToParagraphs([seg(0, `${long}.`), seg(1000, 'next'), seg(2000, 'more')]), [`${long}.`, 'next more']);
    assert.deepEqual(transcriptToParagraphs([seg(0, long), seg(1000, 'mid'), seg(2000, 'end')]), [`${long} mid end`]);
  });

  it('uses h:mm:ss throughout when the transcript passes one hour', () => {
    const text = transcriptToText(
      [
        { startMs: 5_000, durMs: 1, text: 'a' },
        { startMs: 3_700_000, durMs: 1, text: 'b' },
      ],
      true,
    );
    assert.equal(text, '[0:00:05] a\n\n[1:01:40] b');
  });

  it('file has a header then the transcript', () => {
    const file = transcriptFile(zoo, false, { title: 'Me at the zoo', videoId: 'jNQXAC9IVRw', trackLabel: 'English' });
    assert.ok(file.startsWith('Me at the zoo\nhttps://www.youtube.com/watch?v=jNQXAC9IVRw\nCaptions: English\n\nAll right'));
    assert.ok(file.endsWith('to say\n'));
  });

  it('filenames are safe and unique', () => {
    assert.equal(transcriptFilename({ title: 'Me at the zoo', videoId: 'jNQXAC9IVRw', trackLabel: '' }), 'Me at the zoo [jNQXAC9IVRw].txt');
    assert.equal(transcriptFilename({ title: 'A/B: "why?" <3...', videoId: 'x', trackLabel: '' }), 'A B why 3 [x].txt');
    assert.equal(transcriptFilename({ title: '', videoId: 'x', trackLabel: '' }), 'transcript [x].txt');
  });
});
