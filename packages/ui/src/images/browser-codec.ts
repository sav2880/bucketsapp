// SPDX-License-Identifier: Apache-2.0

import type { DecodedImage, ImageCodec } from "./process-image";

interface BitmapImage extends DecodedImage {
  bitmap: ImageBitmap;
}

/**
 * The real decoder and encoder: `createImageBitmap` and a canvas. Both exist in every browser
 * and webview we support; HEIC decodes only where the engine itself can (WebKit).
 *
 * @returns A codec for {@link processImage}.
 */
export function createBrowserCodec(): ImageCodec {
  return {
    async decode(blob) {
      const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
      const image: BitmapImage = {
        bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => {
          bitmap.close();
        },
      };
      return image;
    },
    encode(image, width, height, type, quality) {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (context === null) return Promise.resolve(null);
      if (type === "image/jpeg") {
        // JPEG has no transparency; paint white so transparent areas don't turn black.
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, width, height);
      }
      context.drawImage((image as BitmapImage).bitmap, 0, 0, width, height);
      return new Promise((resolve) => {
        canvas.toBlob(resolve, type, quality);
      });
    },
  };
}
