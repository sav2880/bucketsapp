// SPDX-License-Identifier: Apache-2.0

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Testing Library only unmounts automatically when the test runner exposes global hooks, which this
// repo does not (no `globals`), so do it here.
afterEach(() => {
  cleanup();
});

// jsdom does not implement the modal parts of <dialog>; this is enough for open/close and the
// `close` event that components listen to.
HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement): void {
  this.setAttribute("open", "");
};
HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement): void {
  this.removeAttribute("open");
  this.dispatchEvent(new Event("close"));
};

// jsdom has no layout engine, so it has no ResizeObserver either; components that measure
// themselves only need it to exist. Tests that want to drive it stub their own.
window.ResizeObserver = class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
};

// jsdom has no object URLs; pictures use them for previews.
URL.createObjectURL = () => "blob:test";
URL.revokeObjectURL = () => undefined;

// jsdom has no scrolling; components that scroll something into view only need it to exist.
Element.prototype.scrollIntoView = () => undefined;
