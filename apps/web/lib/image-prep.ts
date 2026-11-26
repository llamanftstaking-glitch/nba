// Browser-side image preparation for JARVIS attachments (contract: "JARVIS image attachments").
// Every image is drawn to a canvas, so the upload is always a JPEG well under the server limit;
// animated GIFs contribute their first frame only.

export const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,image/gif";
export const IMAGE_TYPES = IMAGE_ACCEPT.split(",");
export const MAX_IMAGES = 3;
const MAX_BYTES = 1_400_000;
const STEPS: [number, number][] = [
  [1568, 0.85],
  [1568, 0.75],
  [1568, 0.6],
  [1280, 0.6],
  [1024, 0.6],
];

export type PreparedImage = { id: string; name: string; media_type: "image/jpeg"; data: string; url: string; bytes: number; width: number; height: number };

function load(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("unreadable"));
    };
    img.src = url;
  });
}

function encode(img: HTMLImageElement, longest: number, quality: number): Promise<{ blob: Blob; width: number; height: number }> {
  const scale = Math.min(1, longest / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("canvas"));
  ctx.fillStyle = "#ffffff"; // transparent PNGs get a white background
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve({ blob, width, height }) : reject(new Error("encode"))), "image/jpeg", quality));
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ""));
    r.onerror = () => reject(new Error("read"));
    r.readAsDataURL(blob);
  });
}

/** Downscale (longest side ≤ 1568px) and re-encode as JPEG, stepping quality then size down until it fits. */
export async function prepareImage(file: File): Promise<PreparedImage> {
  const img = await load(file);
  let out: { blob: Blob; width: number; height: number } | null = null;
  for (const [longest, quality] of STEPS) {
    out = await encode(img, longest, quality);
    if (out.blob.size <= MAX_BYTES) break;
  }
  if (!out || out.blob.size > MAX_BYTES) throw new Error("too_large");
  return { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: file.name || "pasted image", media_type: "image/jpeg", data: await toBase64(out.blob), url: URL.createObjectURL(out.blob), bytes: out.blob.size, width: out.width, height: out.height };
}
