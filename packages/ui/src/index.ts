// SPDX-License-Identifier: Apache-2.0

export * from "./tokens/index";
export { strings } from "./strings";
export { t, tp, type PluralBase, type StringKey, type StringParams } from "./i18n";
export {
  MotionSettingProvider,
  useMotionPreference,
  type MotionSetting,
  type MotionSettingProviderProps,
} from "./hooks/use-motion-preference";
export {
  detectPlatform,
  formatShortcut,
  type NavigatorLike,
  type Os,
  type Platform,
} from "./hooks/platform";
export { PlatformProvider, usePlatform, type PlatformProviderProps } from "./hooks/use-platform";
export {
  LiveRegionProvider,
  useAnnounce,
  type Announce,
  type LiveRegionProviderProps,
} from "./live-region";
export {
  clampWidth,
  fitToAvailable,
  gridTemplate,
  resizeColumn,
  type ColumnSpec,
} from "./layout/columns";
export { ResizableColumns, type ResizableColumnsProps } from "./layout/resizable-columns";
export {
  ResizableLayout,
  type PaneSpec,
  type ResizableLayoutProps,
} from "./layout/resizable-layout";
export {
  LibraryProvider,
  useBucket,
  useLibrary,
  useLibraryStore,
  type LibraryProviderProps,
} from "./library/library-provider";

/** Name of this package; a placeholder until its milestone lands (plan.md §15). */
export const PACKAGE_NAME = "@buckets/ui";
