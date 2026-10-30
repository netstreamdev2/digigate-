/** A QR code held in the page itself. There's no file to optimise, so a plain image is the right tool here. */
export function QrImage({ src, alt }: { src: string; alt: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- an inline data URL, which next/image can't help with
  return <img src={src} alt={alt} width={200} height={200} className="self-center rounded-sm bg-surface p-2" />;
}
