/** An image fetched and decoded off the main thread, ready to upload to a GPU without a stall. */
export function decoded(src: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.decoding = 'async';
  image.src = src;
  return image.decode().then(() => image);
}
