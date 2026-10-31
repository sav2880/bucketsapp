// SPDX-License-Identifier: Apache-2.0

import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { ColumnSpec } from "./columns";
import { ResizableColumns } from "./resizable-columns";

const columns: ColumnSpec[] = [
  { id: "name", label: "Name", defaultWidth: 200, minWidth: 100, flexible: true },
  { id: "status", label: "Status", defaultWidth: 100, minWidth: 60, maxWidth: 200 },
  { id: "added", label: "Added", defaultWidth: 100, minWidth: 40 },
];

beforeAll(() => {
  // jsdom does not implement pointer capture.
  Element.prototype.setPointerCapture = () => undefined;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const template = (): string => screen.getByTestId("columns").style.getPropertyValue("--columns");

describe("ResizableColumns", () => {
  it("shows the headers and shares one grid template with rows", () => {
    render(
      <ResizableColumns columns={columns}>
        <div role="row">row</div>
      </ResizableColumns>,
    );
    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      "Name",
      "Status",
      "Added",
    ]);
    expect(template()).toBe("minmax(100px, 1fr) 100px 100px");
  });

  it("has a labelled edge for every column but the last", () => {
    render(<ResizableColumns columns={columns}>{null}</ResizableColumns>);
    const edges = screen.getAllByRole("slider");
    expect(edges.map((e) => e.getAttribute("aria-label"))).toEqual([
      "Resize column Name",
      "Resize column Status",
    ]);
    expect(edges[1]?.getAttribute("aria-valuenow")).toBe("100");
    expect(edges[1]?.getAttribute("aria-valuemax")).toBe("200");
    expect(edges[0]?.getAttribute("aria-valuemax")).toBeNull();
  });

  it("uses saved widths", () => {
    render(
      <ResizableColumns columns={columns} widths={{ status: 140, added: 70 }}>
        {null}
      </ResizableColumns>,
    );
    expect(template()).toBe("minmax(100px, 1fr) 140px 70px");
  });

  it("resizes with the arrow keys and reports every width", async () => {
    const onWidthsChange = vi.fn();
    render(
      <ResizableColumns columns={columns} onWidthsChange={onWidthsChange}>
        {null}
      </ResizableColumns>,
    );
    screen.getByRole("slider", { name: "Resize column Status" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(onWidthsChange).toHaveBeenLastCalledWith({ name: 200, status: 112, added: 100 });
    await userEvent.keyboard("{ArrowLeft}");
    expect(onWidthsChange).toHaveBeenLastCalledWith({ name: 200, status: 88, added: 100 });
  });

  it("resizes by dragging", () => {
    const onWidthsChange = vi.fn();
    render(
      <ResizableColumns columns={columns} onWidthsChange={onWidthsChange}>
        {null}
      </ResizableColumns>,
    );
    const edge = screen.getByRole("slider", { name: "Resize column Status" });
    fireEvent.pointerMove(edge, { clientX: 500 });
    expect(onWidthsChange).not.toHaveBeenCalled();
    fireEvent.pointerDown(edge, { clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(edge, { clientX: 130 });
    expect(onWidthsChange).toHaveBeenLastCalledWith({ name: 200, status: 130, added: 100 });
    fireEvent.pointerUp(edge);
    fireEvent.pointerMove(edge, { clientX: 400 });
    expect(onWidthsChange).toHaveBeenCalledTimes(1);
  });

  it("fits a column to its content on double-click or Enter, else resets to the default", async () => {
    const onWidthsChange = vi.fn();
    const measure = vi.fn((id: string) => (id === "status" ? 150 : 30));
    const { rerender } = render(
      <ResizableColumns columns={columns} onWidthsChange={onWidthsChange} measure={measure}>
        {null}
      </ResizableColumns>,
    );
    const edge = screen.getByRole("slider", { name: "Resize column Status" });
    fireEvent.doubleClick(edge);
    expect(onWidthsChange).toHaveBeenLastCalledWith({ name: 200, status: 150, added: 100 });
    edge.focus();
    await userEvent.keyboard("{Enter}");
    expect(onWidthsChange).toHaveBeenCalledTimes(2);

    rerender(
      <ResizableColumns columns={columns} widths={{ status: 180 }} onWidthsChange={onWidthsChange}>
        {null}
      </ResizableColumns>,
    );
    fireEvent.doubleClick(edge);
    expect(onWidthsChange).toHaveBeenLastCalledWith({ name: 200, status: 100, added: 100 });
  });

  it("ignores other keys", async () => {
    const onWidthsChange = vi.fn();
    render(
      <ResizableColumns columns={columns} onWidthsChange={onWidthsChange}>
        {null}
      </ResizableColumns>,
    );
    screen.getByRole("slider", { name: "Resize column Status" }).focus();
    await userEvent.keyboard("a{ArrowUp}");
    expect(onWidthsChange).not.toHaveBeenCalled();
  });

  it("shrinks the columns together when the space gets narrower", () => {
    let report: ((entries: { contentRect: { width: number } }[]) => void) | undefined;
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: typeof report) {
          report = callback;
        }
        observe(): void {}
        disconnect(): void {}
      },
    );
    render(<ResizableColumns columns={columns}>{null}</ResizableColumns>);
    // 100 goes to the flexible column's minimum, so 120 is left for the 200 wanted.
    act(() => {
      report?.([{ contentRect: { width: 220 } }]);
    });
    expect(template()).toBe("minmax(100px, 1fr) 68px 52px");
  });
});

import { act } from "@testing-library/react";
