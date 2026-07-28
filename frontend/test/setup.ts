import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// vitest.config.ts doesn't enable `test.globals`, so Testing Library can't
// auto-detect a global `afterEach` to register its DOM cleanup — do it
// explicitly, or every test file's renders pile up in the same document.
afterEach(() => {
  cleanup();
});
