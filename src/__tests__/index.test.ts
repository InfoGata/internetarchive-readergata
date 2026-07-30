import { describe, expect, it, beforeEach } from "vitest";
import {
  buildApiId,
  buildQuery,
  buildSearchUrl,
  buildSourceToken,
  docToPublication,
  getSettings,
  parseApiId,
  parseSourceToken,
  pickFile,
  toArray,
} from "../index";
import { defaultSettings, Settings } from "../shared";

const settings = (overrides: Partial<Settings> = {}): Settings => ({
  ...defaultSettings,
  ...overrides,
});

beforeEach(() => {
  localStorage.clear();
});

describe("apiId", () => {
  it("round trips a collection with a sort", () => {
    const apiId = buildApiId({ query: "collection:gutenberg", sort: "date" });
    expect(parseApiId(apiId)).toEqual({
      query: "collection:gutenberg",
      sort: "date",
    });
  });

  it("round trips a collection without a sort", () => {
    const apiId = buildApiId({ query: "collection:zines" });
    expect(parseApiId(apiId)).toEqual({
      query: "collection:zines",
      sort: undefined,
    });
  });

  it("round trips the all-texts collections, which have no query", () => {
    const apiId = buildApiId({ query: "", sort: "downloads" });
    expect(parseApiId(apiId)).toEqual({ query: "", sort: "downloads" });
  });

  it("treats a missing apiId as the whole archive", () => {
    expect(parseApiId(undefined)).toEqual({ query: "" });
  });
});

describe("buildQuery", () => {
  it("restricts to texts with a readable file and excludes restricted items", () => {
    expect(buildQuery(["collection:gutenberg"], settings())).toBe(
      '(collection:gutenberg) AND mediatype:texts AND -access-restricted-item:true AND (format:"EPUB" OR format:"PDF")'
    );
  });

  it("drops empty bases so an unfiltered feed is still valid", () => {
    expect(buildQuery(["", undefined], settings())).toBe(
      'mediatype:texts AND -access-restricted-item:true AND (format:"EPUB" OR format:"PDF")'
    );
  });

  it("combines a collection with the user's search terms", () => {
    expect(buildQuery(["collection:zines", "punk"], settings())).toBe(
      '(collection:zines) AND (punk) AND mediatype:texts AND -access-restricted-item:true AND (format:"EPUB" OR format:"PDF")'
    );
  });

  it("narrows to a single format when asked", () => {
    expect(buildQuery([], settings({ format: "epub" }))).toContain(
      'AND format:"EPUB"'
    );
    expect(buildQuery([], settings({ format: "pdf" }))).toContain(
      'AND format:"PDF"'
    );
  });

  it("keeps restricted items when the user opts in", () => {
    expect(buildQuery([], settings({ includeRestricted: true }))).not.toContain(
      "access-restricted-item"
    );
  });
});

describe("buildSearchUrl", () => {
  it("converts an offset into a 1-based page", () => {
    const url = new URL(buildSearchUrl("mediatype:texts", undefined, 50, 100));
    expect(url.searchParams.get("page")).toBe("3");
    expect(url.searchParams.get("rows")).toBe("50");
    expect(url.searchParams.get("output")).toBe("json");
  });

  it("requests the fields the feed needs", () => {
    const url = new URL(buildSearchUrl("mediatype:texts", undefined, 50, 0));
    expect(url.searchParams.getAll("fl[]")).toContain("format");
    expect(url.searchParams.getAll("fl[]")).toContain("identifier");
  });

  it("omits sort entirely for relevance", () => {
    const url = new URL(buildSearchUrl("mediatype:texts", undefined, 50, 0));
    expect(url.searchParams.has("sort[]")).toBe(false);
  });

  it("passes a sort through when there is one", () => {
    const url = new URL(
      buildSearchUrl("mediatype:texts", "downloads desc", 50, 0)
    );
    expect(url.searchParams.get("sort[]")).toBe("downloads desc");
  });
});

describe("toArray", () => {
  it("wraps the single-value form archive.org sometimes returns", () => {
    expect(toArray("Doyle")).toEqual(["Doyle"]);
    expect(toArray(["Doyle", "Adams"])).toEqual(["Doyle", "Adams"]);
    expect(toArray(undefined)).toEqual([]);
  });
});

describe("docToPublication", () => {
  it("offers a button per available format", () => {
    const publication = docToPublication({
      identifier: "adventuresofsher00doyl",
      title: "Adventures of Sherlock Holmes",
      creator: "Doyle, Arthur Conan",
      format: ["EPUB", "Text PDF", "DjVu"],
    });

    expect(publication.sources).toEqual([
      {
        name: "EPUB",
        source: "adventuresofsher00doyl|epub",
        type: "application/epub+zip",
      },
      {
        name: "PDF",
        source: "adventuresofsher00doyl|pdf",
        type: "application/pdf",
      },
    ]);
    expect(publication.authors).toEqual([{ name: "Doyle, Arthur Conan" }]);
    expect(publication.apiId).toBe("adventuresofsher00doyl");
  });

  it("offers no buttons when nothing readable is present", () => {
    const publication = docToPublication({
      identifier: "alicesadventures19033gut",
      format: ["Text", "ZIP", "JPEG"],
    });
    expect(publication.sources).toEqual([]);
  });

  it("falls back to the identifier when there is no title", () => {
    expect(docToPublication({ identifier: "some-item" }).title).toBe(
      "some-item"
    );
  });
});

describe("source tokens", () => {
  it("round trips", () => {
    expect(parseSourceToken(buildSourceToken("some-item", "pdf"))).toEqual({
      identifier: "some-item",
      kind: "pdf",
    });
  });

  it("keeps identifiers that contain the separator intact", () => {
    expect(parseSourceToken(buildSourceToken("weird|id", "epub"))).toEqual({
      identifier: "weird|id",
      kind: "epub",
    });
  });

  it("rejects a source it did not create", () => {
    expect(() => parseSourceToken("nonsense")).toThrow();
  });
});

describe("pickFile", () => {
  const files = [
    { name: "item_bw.pdf", format: "Text PDF" },
    { name: "item.pdf", format: "Image Container PDF" },
    { name: "item.epub", format: "EPUB" },
    { name: "item.djvu", format: "DjVu" },
  ];

  it("finds the epub", () => {
    expect(pickFile(files, "epub")?.name).toBe("item.epub");
  });

  it("skips bitonal scans even though they are the preferred format", () => {
    expect(pickFile(files, "pdf")?.name).toBe("item.pdf");
  });

  it("prefers Text PDF over Image Container PDF", () => {
    const withBoth = [
      { name: "scan.pdf", format: "Image Container PDF" },
      { name: "text.pdf", format: "Text PDF" },
    ];
    expect(pickFile(withBoth, "pdf")?.name).toBe("text.pdf");
  });

  it("returns undefined when the format is missing", () => {
    expect(pickFile([{ name: "item.txt", format: "Text" }], "epub")).toBe(
      undefined
    );
    expect(pickFile(undefined, "pdf")).toBe(undefined);
  });
});

describe("getSettings", () => {
  it("defaults when nothing is stored", () => {
    expect(getSettings()).toEqual(defaultSettings);
  });

  it("fills in fields added after the user last saved", () => {
    localStorage.setItem("settings", JSON.stringify({ resultsPerPage: 10 }));
    expect(getSettings()).toEqual({ ...defaultSettings, resultsPerPage: 10 });
  });

  it("falls back to defaults on unparseable storage", () => {
    localStorage.setItem("settings", "{not json");
    expect(getSettings()).toEqual(defaultSettings);
  });
});
