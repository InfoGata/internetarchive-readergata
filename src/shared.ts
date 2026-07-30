export type SortOption = "relevance" | "downloads" | "date" | "title";
export type FormatOption = "any" | "epub" | "pdf";

export interface Settings {
  /**
   * How many publications to return per page.
   */
  resultsPerPage: number;
  sort: SortOption;
  /**
   * Which file formats an item must have to be listed.
   */
  format: FormatOption;
  /**
   * Lending-restricted items are DRM protected and will not open, so they are
   * left out unless the user asks for them.
   */
  includeRestricted: boolean;
}

type UiGetSettings = { type: "get-settings" };
type UiSaveSettings = { type: "save-settings"; settings: Settings };

/** options page -> plugin */
export type UiMessageType = UiGetSettings | UiSaveSettings;

type SettingsMessage = { type: "settings"; settings: Settings };

/** plugin -> options page */
export type MessageType = SettingsMessage;

export const defaultSettings: Settings = {
  resultsPerPage: 50,
  sort: "downloads",
  format: "any",
  includeRestricted: false,
};
