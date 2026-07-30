import { useState, useEffect } from "preact/hooks";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import {
  defaultSettings,
  FormatOption,
  MessageType,
  Settings,
  SortOption,
  UiMessageType,
} from "./shared";

const sendUiMessage = (message: UiMessageType) => {
  parent.postMessage(message, "*");
};

const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

const sortOptions: { value: SortOption; label: string }[] = [
  { value: "downloads", label: "Most downloaded" },
  { value: "date", label: "Recently added" },
  { value: "title", label: "Title" },
  { value: "relevance", label: "Relevance" },
];

const formatOptions: { value: FormatOption; label: string }[] = [
  { value: "any", label: "EPUB or PDF" },
  { value: "epub", label: "EPUB only" },
  { value: "pdf", label: "PDF only" },
];

const App = () => {
  const [settings, setSettings] = useState<Settings>(defaultSettings);

  useEffect(() => {
    const onMessage = (event: MessageEvent<MessageType>) => {
      switch (event.data.type) {
        case "settings":
          setSettings(event.data.settings);
          break;
      }
    };

    window.addEventListener("message", onMessage);
    sendUiMessage({ type: "get-settings" });
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const save = () => {
    sendUiMessage({ type: "save-settings", settings });
  };

  return (
    <div className="flex flex-col gap-4">
      <h1>Internet Archive Settings</h1>

      <label className="flex flex-col gap-1">
        <span>Results per page</span>
        <Input
          type="number"
          min={1}
          max={100}
          value={String(settings.resultsPerPage)}
          onChange={(e: any) => {
            const value = Number((e.target as HTMLInputElement).value);
            setSettings({
              ...settings,
              resultsPerPage: Number.isFinite(value) ? value : 50,
            });
          }}
        />
        <span className="text-sm">Between 1 and 100.</span>
      </label>

      <label className="flex flex-col gap-1">
        <span>Sort by</span>
        <select
          className={selectClass}
          value={settings.sort}
          onChange={(e: any) => {
            const value = (e.target as HTMLSelectElement).value as SortOption;
            setSettings({ ...settings, sort: value });
          }}
        >
          {sortOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <span className="text-sm">
          Used unless a collection has its own order.
        </span>
      </label>

      <label className="flex flex-col gap-1">
        <span>Formats to list</span>
        <select
          className={selectClass}
          value={settings.format}
          onChange={(e: any) => {
            const value = (e.target as HTMLSelectElement).value as FormatOption;
            setSettings({ ...settings, format: value });
          }}
        >
          {formatOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <span className="text-sm">
          Items without a readable file are always left out.
        </span>
      </label>

      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          className="mt-1"
          checked={settings.includeRestricted}
          onChange={(e: any) => {
            const checked = (e.target as HTMLInputElement).checked;
            setSettings({ ...settings, includeRestricted: checked });
          }}
        />
        <span className="flex flex-col">
          <span>Include lending-restricted items</span>
          <span className="text-sm">
            These are DRM protected and will not open in ReaderGata.
          </span>
        </span>
      </label>

      <Button onClick={save}>Save</Button>
    </div>
  );
};

export default App;
