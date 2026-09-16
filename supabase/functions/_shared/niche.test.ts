import { describe, it, expect } from 'vitest';
import { canonicalNiche, inspirationTagsForNiche, INSPIRATION_TOPIC_TAGS } from './niche.ts';

describe('canonicalNiche', () => {
  it('collapses guitar variants onto one slug', () => {
    expect(canonicalNiche('Rock Guitar')).toBe('guitar');
    expect(canonicalNiche('Guitar improvisation')).toBe('guitar');
  });

  it('drops filler words and keeps three content words', () => {
    expect(canonicalNiche('how to grow a channel for busy dads')).toBe('grow channel busy');
  });

  it('returns an empty slug for empty input', () => {
    expect(canonicalNiche('')).toBe('');
  });
});

describe('inspirationTagsForNiche', () => {
  it('returns nothing for a blank niche', () => {
    expect(inspirationTagsForNiche('')).toEqual([]);
    expect(inspirationTagsForNiche('   ')).toEqual([]);
  });

  it('returns nothing for a niche the shared shelf has no vocabulary for', () => {
    expect(inspirationTagsForNiche('guitar')).toEqual([]);
    expect(inspirationTagsForNiche('sourdough baking')).toEqual([]);
  });

  it('maps a creator-coaching niche onto several tags', () => {
    const tags = inspirationTagsForNiche('helping creators grow and monetize on YouTube');
    expect(tags).toContain('Content Creation');
    expect(tags).toContain('Monetization');
    expect(tags).toContain('Social Media Growth');
  });

  it('matches multi-word phrases', () => {
    expect(inspirationTagsForNiche('personal brand for founders')).toContain('Personal Brand');
    expect(inspirationTagsForNiche('video editing tutorials')).toContain('Video Editing');
  });

  it('matches whole words only, so "airline" is not an AI niche', () => {
    expect(inspirationTagsForNiche('airline travel hacks')).not.toContain('AI Tools');
    expect(inspirationTagsForNiche('ai tools for solo founders')).toContain('AI Tools');
  });

  it('only ever returns tags from the known vocabulary, in vocabulary order', () => {
    const tags = inspirationTagsForNiche('copywriting, marketing and productivity systems');
    for (const t of tags) expect(INSPIRATION_TOPIC_TAGS).toContain(t as never);
    const positions = tags.map((t) => INSPIRATION_TOPIC_TAGS.indexOf(t as never));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });
});
