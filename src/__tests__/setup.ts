import { vi } from "vitest";
import "@testing-library/jest-dom/vitest";

// Mock the `application` global used by the plugin runtime
(globalThis as any).application = {
  onUiMessage: null,
  onGetFeed: null,
  onGetPublication: null,
  onSearch: null,
  onChangeTheme: null,
  postUiMessage: vi.fn(),
  getTheme: vi.fn().mockResolvedValue("light"),
};
