import { useEffect, useState, type ImgHTMLAttributes, type VideoHTMLAttributes } from 'react';
import { signMediaUrls, isMediaRef, DISPLAY_TTL } from '../../lib/mediaUrls';

/**
 * Render a stored media reference (see src/lib/mediaUrls.ts).
 *
 * A reference into the private media bucket needs a signed URL before an
 * <img> or <video> can load it. These resolve that in an effect and render
 * nothing for the bucket case until the URL is ready, so a private object URL
 * never reaches the browser as a broken image. A foreign URL (a platform
 * thumbnail, a Post for Me CDN file) renders immediately.
 */

/** Signed display URLs for a list of references, same order, '' while pending. */
export function useSignedMediaUrls(refs: readonly (string | null | undefined)[]): string[] {
  const key = refs.join('\n');
  const [urls, setUrls] = useState<string[]>(() => refs.map((r) => (r && !isMediaRef(r) ? r : '')));

  useEffect(() => {
    let active = true;
    // Foreign URLs show straight away; bucket references wait for their token.
    setUrls(refs.map((r) => (r && !isMediaRef(r) ? r : '')));
    if (!refs.some((r) => isMediaRef(r))) return;
    signMediaUrls(refs, DISPLAY_TTL).then((signed) => {
      if (active) setUrls(signed);
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return urls;
}

/** One reference. '' while a bucket reference is still being signed. */
export function useSignedMediaUrl(ref: string | null | undefined): string {
  const [url] = useSignedMediaUrls([ref]);
  return url ?? '';
}

type SignedImgProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & { src: string | null | undefined };

export function SignedImg({ src, alt = '', ...rest }: SignedImgProps) {
  const url = useSignedMediaUrl(src);
  if (!url) return null;
  return <img src={url} alt={alt} {...rest} />;
}

type SignedVideoProps = Omit<VideoHTMLAttributes<HTMLVideoElement>, 'src'> & { src: string | null | undefined };

export function SignedVideo({ src, ...rest }: SignedVideoProps) {
  const url = useSignedMediaUrl(src);
  if (!url) return null;
  return <video src={url} {...rest} />;
}
