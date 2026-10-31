// SPDX-License-Identifier: Apache-2.0

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Testing Library only unmounts automatically when the test runner exposes global hooks, which this
// repo does not (no `globals`), so do it here.
afterEach(() => {
  cleanup();
});
