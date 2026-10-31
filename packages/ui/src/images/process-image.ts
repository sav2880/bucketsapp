// SPDX-License-Identifier: Apache-2.0

import type { Attachment } from "@buckets/core";

/** Largest picture file we will read, in bytes. */
export const MAX_INPUT_BYTES = 10 * 1024 * 1024;
/** Longest side of a stored picture, in pixels. Bigger ones are scaled down. */
export const MAX_SIDE = 2560;

/** Picture types a stored attachment may have. */
export type ImageMime = Attachment["mime"];

/** Picture types we accept as input. HEIC only works where the browser can decode it. */
const ACCEPTED: readonly string[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
];

/** The `accept` list for a file picker. */
export const ACCEPT_ATTRIBUTE = ACCEPTED.join(",");

/** A picture the browser has decoded, ready to be drawn again at another size. */
export interface DecodedImage {
  /** Pixel width. */
  width: number;
  /** Pixel height. */
  height: number;
  /** Frees memory held by the decoder. */
  close?: () => void;
}

/** What {@link processImage} needs from the browser, so tests can supply a fake. */
export interface ImageCodec {
  /**
   * Decodes a picture, applying its EXIF rotation. Rejects when the browser can't read it.
   *
   * @param blob - The file.
   * @returns The decoded picture.
   */
  decode(blob: Blob): Promise<DecodedImage>;
  /**
   * Draws the picture onto a fresh canvas at a size and encodes it. Drawing from pixels drops
   * all metadata, including GPS (EXIF), which is the point.
   *
   * @param image - From `decode`.
   * @param width - Output width.
   * @param height - Output height.
   * @param type - Wanted type. The browser may fall back to another; the blob's own type says which.
   * @param quality - 0 to 1, for lossy types.
   * @returns The encoded picture, or `null` when encoding failed.
   */
  encode(
    image: DecodedImage,
    width: number,
    height: number,
    type: string,
    quality: number,
  ): Promise<Blob | null>;
}

/** Why a picture was not accepted. */
export type ImageFailure =
  /** More than {@link MAX_INPUT_BYTES}. */
  | "too-large"
  /** Not a picture type we take. */
  | "unsupported"
  /** HEIC that this browser can't decode. */
  | "heic-unreadable"
  /** Damaged, or something the browser can't decode. */
  | "unreadable";

/** Result of {@link processImage}. */
export type ProcessedImage =
  | { ok: true; bytes: Uint8Array; mime: ImageMime; width: number; height: number }
  | { ok: false; reason: ImageFailure };

/**
 * Scales a size down to fit a longest side, keeping the shape. Never scales up.
 *
 * @param width - Pixel width.
 * @param height - Pixel height.
 * @param max - Longest side allowed.
 * @returns Whole-pixel size, at least 1 by 1.
 */
export function fitWithin(
  width: number,
  height: number,
  max: number,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= max) return { width, height };
  const scale = max / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Picks the type to store for an input type: JPEG stays JPEG, WebP stays WebP, the rest become PNG or JPEG. */
function outputFor(input: string): { type: ImageMime; quality: number } {
  if (input === "image/jpeg" || input === "image/heic" || input === "image/heif")
    return { type: "image/jpeg", quality: 0.9 };
  if (input === "image/webp") return { type: "image/webp", quality: 0.9 };
  // PNG and GIF become PNG; an animated GIF keeps only its first frame.
  return { type: "image/png", quality: 1 };
}

const STORED: readonly string[] = ["image/jpeg", "image/png", "image/webp"];

/**
 * Checks a picture, scales it down and re-encodes it, which strips EXIF metadata such as GPS
 * (plan.md §5, §11). The result is what goes into the blob store.
 *
 * @param file - The picture the user chose, dropped or pasted.
 * @param codec - The browser's decoder and encoder.
 * @returns The bytes and size to store, or the reason it was refused.
 */
export async function processImage(file: Blob, codec: ImageCodec): Promise<ProcessedImage> {
  if (!ACCEPTED.includes(file.type)) return { ok: false, reason: "unsupported" };
  if (file.size > MAX_INPUT_BYTES) return { ok: false, reason: "too-large" };

  let decoded: DecodedImage;
  try {
    decoded = await codec.decode(file);
  } catch {
    return {
      ok: false,
      reason: file.type.startsWith("image/hei") ? "heic-unreadable" : "unreadable",
    };
  }
  try {
    const size = fitWithin(decoded.width, decoded.height, MAX_SIDE);
    const wanted = outputFor(file.type);
    const encoded = await codec.encode(
      decoded,
      size.width,
      size.height,
      wanted.type,
      wanted.quality,
    );
    if (encoded === null || !STORED.includes(encoded.type))
      return { ok: false, reason: "unreadable" };
    return {
      ok: true,
      bytes: new Uint8Array(await encoded.arrayBuffer()),
      // A browser without WebP encoding hands back PNG; trust the blob, not the request.
      mime: encoded.type as ImageMime,
      ...size,
    };
  } finally {
    decoded.close?.();
  }
}
