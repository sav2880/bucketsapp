// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import { createBrowserCodec } from "./browser-codec";
import {
  MAX_INPUT_BYTES,
  fitWithin,
  processImage,
  type DecodedImage,
  type ImageCodec,
} from "./process-image";

function fakeCodec(
  size = { width: 4000, height: 3000 },
  outputType?: string,
): { codec: ImageCodec; encode: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> } {
  const close = vi.fn();
  const encode = vi.fn((_: DecodedImage, w: number, h: number, type: string) =>
    Promise.resolve(new Blob([`${String(w)}x${String(h)}`], { type: outputType ?? type })),
  );
  return {
    close,
    encode,
    codec: { decode: () => Promise.resolve({ ...size, close }), encode },
  };
}

const file = (type: string, bytes = 10): Blob => new Blob([new Uint8Array(bytes)], { type });

describe("fitWithin", () => {
  it("scales the long side down and keeps the shape", () => {
    expect(fitWithin(4000, 3000, 2560)).toEqual({ width: 2560, height: 1920 });
    expect(fitWithin(3000, 6000, 2560)).toEqual({ width: 1280, height: 2560 });
  });

  it("never scales up and never makes a side zero", () => {
    expect(fitWithin(800, 600, 2560)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(10_000, 1, 2560)).toEqual({ width: 2560, height: 1 });
  });
});

describe("processImage", () => {
  it("scales a big JPEG down and keeps it a JPEG", async () => {
    const { codec, encode, close } = fakeCodec();
    const result = await processImage(file("image/jpeg"), codec);
    expect(result).toMatchObject({ ok: true, mime: "image/jpeg", width: 2560, height: 1920 });
    expect(encode).toHaveBeenCalledWith(expect.anything(), 2560, 1920, "image/jpeg", 0.9);
    expect(close).toHaveBeenCalled();
    if (result.ok) expect(new TextDecoder().decode(result.bytes)).toBe("2560x1920");
  });

  it.each([
    ["image/png", "image/png"],
    ["image/gif", "image/png"],
    ["image/webp", "image/webp"],
    ["image/heic", "image/jpeg"],
    ["image/heif", "image/jpeg"],
  ])("stores %s as %s", async (input, stored) => {
    const result = await processImage(file(input), fakeCodec({ width: 100, height: 50 }).codec);
    expect(result).toMatchObject({ ok: true, mime: stored, width: 100, height: 50 });
  });

  it("trusts the type the browser actually produced", async () => {
    const result = await processImage(
      file("image/webp"),
      fakeCodec({ width: 10, height: 10 }, "image/png").codec,
    );
    expect(result).toMatchObject({ ok: true, mime: "image/png" });
  });

  it("refuses other types and files over 10 MB before decoding", async () => {
    const { codec } = fakeCodec();
    const decode = vi.spyOn(codec, "decode");
    expect(await processImage(file("application/pdf"), codec)).toEqual({
      ok: false,
      reason: "unsupported",
    });
    expect(await processImage(file("image/svg+xml"), codec)).toEqual({
      ok: false,
      reason: "unsupported",
    });
    expect(await processImage(file("image/png", MAX_INPUT_BYTES + 1), codec)).toEqual({
      ok: false,
      reason: "too-large",
    });
    expect((await processImage(file("image/png", MAX_INPUT_BYTES), codec)).ok).toBe(true);
    expect(decode).toHaveBeenCalledTimes(1);
  });

  it("tells HEIC that can't be read apart from other damaged files", async () => {
    const codec: ImageCodec = {
      decode: () => Promise.reject(new Error("no")),
      encode: () => Promise.resolve(null),
    };
    expect(await processImage(file("image/heic"), codec)).toEqual({
      ok: false,
      reason: "heic-unreadable",
    });
    expect(await processImage(file("image/jpeg"), codec)).toEqual({
      ok: false,
      reason: "unreadable",
    });
  });

  it("reports an encoder that fails, and still frees the picture", async () => {
    const close = vi.fn();
    const codec: ImageCodec = {
      decode: () => Promise.resolve({ width: 5, height: 5, close }),
      encode: () => Promise.resolve(null),
    };
    expect(await processImage(file("image/png"), codec)).toEqual({
      ok: false,
      reason: "unreadable",
    });
    expect(close).toHaveBeenCalled();
  });

  it("works for a decoder that has nothing to free", async () => {
    const codec: ImageCodec = {
      decode: () => Promise.resolve({ width: 5, height: 5 }),
      encode: (_i, _w, _h, type) => Promise.resolve(new Blob(["x"], { type })),
    };
    expect((await processImage(file("image/png"), codec)).ok).toBe(true);
  });
});

describe("the browser codec", () => {
  it("decodes with createImageBitmap and draws onto a canvas, painting JPEGs white first", async () => {
    const close = vi.fn();
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(() => Promise.resolve({ width: 40, height: 30, close })),
    );
    const calls: string[] = [];
    const context = {
      fillStyle: "",
      fillRect: () => calls.push(`fill ${context.fillStyle}`),
      drawImage: (_b: unknown, _x: number, _y: number, w: number, h: number) =>
        calls.push(`draw ${String(w)}x${String(h)}`),
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      context as unknown as CanvasRenderingContext2D,
    );
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback, type) => {
      callback(new Blob(["x"], { type: type ?? "" }));
    });
    const codec = createBrowserCodec();
    const image = await codec.decode(new Blob(["x"], { type: "image/jpeg" }));
    expect(image).toMatchObject({ width: 40, height: 30 });
    const blob = await codec.encode(image, 20, 15, "image/jpeg", 0.9);
    expect(blob?.type).toBe("image/jpeg");
    expect(calls).toEqual(["fill #ffffff", "draw 20x15"]);
    await codec.encode(image, 20, 15, "image/png", 1);
    expect(calls.slice(2)).toEqual(["draw 20x15"]);
    image.close?.();
    expect(close).toHaveBeenCalled();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("gives up cleanly when there is no canvas context", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    expect(
      await createBrowserCodec().encode({ width: 1, height: 1 }, 1, 1, "image/png", 1),
    ).toBeNull();
    vi.restoreAllMocks();
  });
});
