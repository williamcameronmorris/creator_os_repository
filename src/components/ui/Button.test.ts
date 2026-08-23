import { describe, it, expect } from 'vitest';
import { buttonClass } from './Button';

/**
 * These assert on exact class strings rather than behaviour on purpose.
 *
 * The first build of this component composed names as `btn-${variant}`, and
 * Tailwind — which finds classes by scanning source text — purged btn-danger,
 * btn-ghost and every size out of the stylesheet. The buttons rendered as
 * unpadded bare text and the build stayed green throughout, because nothing
 * about it is a type error. A test that pins the literals is the only cheap
 * guard against that happening again.
 */
describe('buttonClass', () => {
  it('defaults to a medium primary', () => {
    expect(buttonClass()).toBe('btn btn-primary btn-md');
  });

  it('emits every variant as a complete literal', () => {
    expect(buttonClass({ variant: 'primary' })).toContain('btn-primary');
    expect(buttonClass({ variant: 'secondary' })).toContain('btn-secondary');
    expect(buttonClass({ variant: 'danger' })).toContain('btn-danger');
    expect(buttonClass({ variant: 'ghost' })).toContain('btn-ghost');
  });

  it('emits every size as a complete literal', () => {
    expect(buttonClass({ size: 'sm' })).toContain('btn-sm');
    expect(buttonClass({ size: 'md' })).toContain('btn-md');
    expect(buttonClass({ size: 'lg' })).toContain('btn-lg');
  });

  it('adds btn-block only when asked', () => {
    expect(buttonClass({ block: true })).toContain('btn-block');
    expect(buttonClass({ block: false })).not.toContain('btn-block');
  });

  it('appends caller classes last so they can override', () => {
    expect(buttonClass({ className: 'mt-4' })).toBe('btn btn-primary btn-md mt-4');
  });

  it('drops empty segments rather than leaving double spaces', () => {
    expect(buttonClass({ className: '' })).not.toContain('  ');
  });
});
