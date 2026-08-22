import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, AnchorHTMLAttributes } from 'react';

/**
 * The Printed Edge button.
 *
 * The app had 211 hand-styled <button> tags across 51 files before this, no two
 * of them agreeing — some rounded, some square, some carrying a shadow. That
 * disagreement, not flatness alone, was what made buttons feel unresolved. So
 * the point of this component is less the treatment than having one place the
 * treatment is defined.
 *
 * The visual recipe lives in index.css under `@layer components`, driven by the
 * --btn-* tokens, because the face and edge swap wholesale between themes
 * (deep sage on paper, gold on ink) and the token blocks are already where
 * theme switching happens. Keeping it there also means an <a> styled as a
 * button gets the identical treatment via buttonClass() below.
 */

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface CommonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Stretch to the container's full width. */
  block?: boolean;
  className?: string;
}

/*
 * Tailwind scans source text for class names, so every class has to appear as a
 * complete literal somewhere. Building them with `btn-${variant}` made Tailwind
 * purge btn-danger, btn-ghost and all three sizes out of the stylesheet — the
 * buttons rendered as bare unpadded text. These maps keep the full strings in
 * the source where the scanner can find them.
 */
const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  danger: 'btn-danger',
  ghost: 'btn-ghost',
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: 'btn-sm',
  md: 'btn-md',
  lg: 'btn-lg',
};

/**
 * Class string for the treatment, exported so anchors and router Links can be
 * styled identically without being wrapped in a <button>. Reach for this rather
 * than re-declaring the classes at a call site.
 */
export function buttonClass({
  variant = 'primary',
  size = 'md',
  block = false,
  className = '',
}: CommonProps = {}): string {
  return [
    'btn',
    VARIANT_CLASS[variant],
    SIZE_CLASS[size],
    block ? 'btn-block' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
}

type ButtonProps = CommonProps & ButtonHTMLAttributes<HTMLButtonElement>;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, block, className, type = 'button', ...rest },
  ref
) {
  // Default to type="button". A bare <button> inside a form submits it, which
  // has caused accidental submits in this codebase before.
  return (
    <button
      ref={ref}
      type={type}
      className={buttonClass({ variant, size, block, className })}
      {...rest}
    />
  );
});

type LinkButtonProps = CommonProps & AnchorHTMLAttributes<HTMLAnchorElement>;

/** An <a> that carries the button treatment. For real navigation only. */
export const LinkButton = forwardRef<HTMLAnchorElement, LinkButtonProps>(
  function LinkButton({ variant, size, block, className, ...rest }, ref) {
    return (
      <a
        ref={ref}
        className={buttonClass({ variant, size, block, className })}
        {...rest}
      />
    );
  }
);
