import { useEffect, useState, type ImgHTMLAttributes } from 'react';
import { getSignedStorageUrl } from '@/lib/api';

// Renders an uploaded file (ID photo, signature, …) only once its short-lived
// signed URL has been fetched; renders nothing when there is no stored path or
// the URL request fails. The prop is named `path` (NOT `ref`) because JSX
// treats `ref` as the reserved React ref attribute — passing a string there
// makes React 18 throw "Function components cannot have string refs" and
// blank the whole page via the error boundary.
export function SignedImg({ bucket, path, ...props }: { bucket: string; path: string } & ImgHTMLAttributes<HTMLImageElement>) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    getSignedStorageUrl(bucket, path)
      .then((u) => {
        if (!cancelled) setSrc(u);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [bucket, path]);
  return src ? <img src={src} {...props} /> : null;
}
