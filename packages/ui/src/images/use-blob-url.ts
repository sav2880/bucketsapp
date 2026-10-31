// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from "react";
import { useEnvironment } from "../app-environment";

/**
 * Turns a stored picture into a URL an `<img>` can show, and frees it when no longer needed.
 *
 * @param blobId - Id in the blob store.
 * @param mime - The picture's type.
 * @returns The URL, or `undefined` while loading or when the bytes are missing.
 */
export function useBlobUrl(blobId: string, mime: string): string | undefined {
  const { blobs } = useEnvironment();
  const [url, setUrl] = useState<string | undefined>(undefined);
  useEffect(() => {
    let current = true;
    let created: string | undefined;
    void blobs.get(blobId).then((bytes) => {
      if (bytes === undefined || !current) return;
      created = URL.createObjectURL(new Blob([bytes.slice()], { type: mime }));
      setUrl(created);
    });
    return () => {
      current = false;
      if (created !== undefined) URL.revokeObjectURL(created);
    };
  }, [blobs, blobId, mime]);
  return url;
}
