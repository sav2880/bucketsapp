// SPDX-License-Identifier: Apache-2.0

import { createContext, useContext, useMemo, type ReactElement, type ReactNode } from "react";
import { MotionSettingProvider, type MotionSetting } from "./use-motion-preference";
import { useSetting } from "./use-setting";

/** The values a stored motion setting may have. */
const SETTINGS: readonly MotionSetting[] = ["system", "reduce", "allow"];

function isMotionSetting(value: unknown): value is MotionSetting {
  return SETTINGS.some((setting) => setting === value);
}

type Control = readonly [MotionSetting, (setting: MotionSetting) => void];

const ControlContext = createContext<Control>(["system", () => undefined]);

/** Props for {@link StoredMotionSettingProvider}. */
export interface StoredMotionSettingProviderProps {
  /** What to render. */
  children: ReactNode;
}

/**
 * Keeps the user's in-app motion choice (follow the system, reduce, allow) in this device's
 * settings, and applies it to everything below through `useMotionPreference`.
 *
 * @param props - See {@link StoredMotionSettingProviderProps}.
 * @returns The provider.
 */
export function StoredMotionSettingProvider({
  children,
}: StoredMotionSettingProviderProps): ReactElement {
  const [stored, update] = useSetting("motion", isMotionSetting);
  const setting = stored ?? "system";
  const control = useMemo<Control>(() => [setting, update], [setting, update]);
  return (
    <ControlContext value={control}>
      <MotionSettingProvider setting={setting}>{children}</MotionSettingProvider>
    </ControlContext>
  );
}

/**
 * The stored motion setting and a function that changes it, for the settings control.
 *
 * @returns The current choice and its setter.
 */
export function useMotionSetting(): Control {
  return useContext(ControlContext);
}
