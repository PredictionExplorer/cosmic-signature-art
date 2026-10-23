import type { ImageProps } from 'next/image';
// Production ArtworkMedia requests unoptimized images. Render that same resource
// without Next's runtime context in this isolated client-component harness.
export default function Image({
  src,
  width,
  height,
  alt,
  loading,
  priority,
  className,
  onLoad,
  onError,
  style,
}: ImageProps) {
  const source = typeof src === 'string' ? src : 'default' in src ? src.default.src : src.src;
  return (
    <img
      src={source}
      width={width}
      height={height}
      alt={alt}
      loading={priority ? 'eager' : loading}
      className={className}
      onLoad={onLoad}
      onError={onError}
      style={style}
    />
  );
}
