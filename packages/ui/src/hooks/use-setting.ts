// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useState } from "react";
import { useEnvironment } from "../app-environment";

/**
 * A per-device preference that survives restarts, such as column widths.
 *
 * @param key - Name in the settings store.
 * @param isValid - Checks what was stored, so damaged or old values are ignored.
 * @returns The value (`undefined` until loaded or when unset) and a function that changes and saves it.
 */
export function useSetting<T>(
  key: string,
  isValid: (value: unknown) => value is T,
): [T | undefined, (value: T) => void] {
  const { settings } = useEnvironment();
  const [value, setValue] = useState<T | undefined>(undefined);

  useEffect(() => {
    let current = true;
    void settings?.get(key).then((stored) => {
      if (current && isValid(stored)) setValue(stored);
    });
    return () => {
      current = false;
    };
  }, [settings, key, isValid]);

  const update = useCallback(
    (next: T) => {
      setValue(next);
      void settings?.set(key, next);
    },
    [settings, key],
  );
  return [value, update];
}
