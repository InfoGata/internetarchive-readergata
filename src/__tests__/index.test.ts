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
import {
  buildFilterInfo,
  effectiveValues,
  escapeTerm,
  resolveQuery,
} from "../filters";
import { defaultSettings, Settings, SortOption } from "../shared";

const settings = (overrides: Partial<Settings> = {}): Settings => ({
  ...defaultSettings,
  ...overrides,
});

/** The resolved query for a set of chosen filters, as searchFeed builds it. */
const resolved = (
  chosen: Record<string, string> = {},
  overrides: Partial<Settings> = {},
  collectionSort?: SortOption
) => resolveQuery(effectiveValues(chosen, settings(overrides), collectionSort));

const filterById = (info: FilterInfo, id: string) =>
  info.filters.find((f) => f.id === id);

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
    expect(buildQuery(["collection:gutenberg"], resolved())).toBe(
      '(collection:gutenberg) AND mediatype:texts AND -access-restricted-item:true AND (format:"EPUB" OR format:"PDF")'
    );
  });

  it("drops empty bases so an unfiltered feed is still valid", () => {
    expect(buildQuery(["", undefined], resolved())).toBe(
      'mediatype:texts AND -access-restricted-item:true AND (format:"EPUB" OR format:"PDF")'
    );
  });

  it("combines a collection with the user's search terms", () => {
    expect(buildQuery(["collection:zines", "punk"], resolved())).toBe(
      '(collection:zines) AND (punk) AND mediatype:texts AND -access-restricted-item:true AND (format:"EPUB" OR format:"PDF")'
    );
  });

  it("narrows to a single format when asked", () => {
    expect(buildQuery([], resolved({}, { format: "epub" }))).toContain(
      'AND format:"EPUB"'
    );
    expect(buildQuery([], resolved({}, { format: "pdf" }))).toContain(
      'AND format:"PDF"'
    );
  });

  it("keeps restricted items when the user opts in", () => {
    expect(
      buildQuery([], resolved({}, { includeRestricted: true }))
    ).not.toContain("access-restricted-item");
  });

  it("appends the clauses the filters contribute", () => {
    expect(
      buildQuery(
        ["collection:zines"],
        resolved({ language: "French", creator: "Doyle", yearFrom: "1900" })
      )
    ).toBe(
      '(collection:zines) AND mediatype:texts AND -access-restricted-item:true AND (format:"EPUB" OR format:"PDF") AND language:"French" AND creator:"Doyle" AND year:[1900 TO *]'
    );
  });
});

describe("effectiveValues", () => {
  it("falls back to the user's settings", () => {
    expect(effectiveValues(undefined, settings())).toEqual({
      sort: "downloads",
      format: "any",
      restricted: "exclude",
      language: "any",
      creator: "",
      yearFrom: "",
      yearTo: "",
    });
  });

  it("prefers the collection's own sort over the settings default", () => {
    expect(effectiveValues(undefined, settings(), "date").sort).toBe("date");
  });

  it("lets a chosen sort override the collection's", () => {
    expect(effectiveValues({ sort: "title" }, settings(), "date").sort).toBe(
      "title"
    );
  });

  it("ignores values that are not filters it knows", () => {
    const values = effectiveValues(
      { sort: "nonsense", format: "djvu" },
      settings({ sort: "date", format: "epub" })
    );
    expect(values.sort).toBe("date");
    expect(values.format).toBe("epub");
  });

  it("reads restricted from settings when the user has not chosen", () => {
    expect(
      effectiveValues(undefined, settings({ includeRestricted: true }))
        .restricted
    ).toBe("include");
    expect(
      effectiveValues({ restricted: "exclude" }, settings({ includeRestricted: true }))
        .restricted
    ).toBe("exclude");
  });
});

describe("resolveQuery", () => {
  it("turns a sort into an archive.org expression", () => {
    expect(resolved({ sort: "date" }).sort).toBe("addeddate desc");
    expect(resolved({ sort: "relevance" }).sort).toBe(undefined);
  });

  it("adds no clause for the any-language option", () => {
    expect(resolved({ language: "any" }).clauses).toEqual([]);
  });

  it("builds a two-sided year range", () => {
    expect(resolved({ yearFrom: "1900", yearTo: "1950" }).clauses).toEqual([
      "year:[1900 TO 1950]",
    ]);
  });

  it("leaves the open end of a one-sided range as a wildcard", () => {
    expect(resolved({ yearTo: "1950" }).clauses).toEqual(["year:[* TO 1950]"]);
  });

  it("ignores a year that is not a year", () => {
    expect(resolved({ yearFrom: "nineteen hundred" }).clauses).toEqual([]);
  });

  it("ignores a blank author", () => {
    expect(resolved({ creator: "   " }).clauses).toEqual([]);
  });

  it("escapes a value so it cannot break out of the quoted phrase", () => {
    expect(resolved({ creator: 'Doyle" OR mediatype:movies' }).clauses).toEqual([
      'creator:"Doyle\\" OR mediatype:movies"',
    ]);
  });
});

describe("escapeTerm", () => {
  it("escapes backslashes before quotes so the escape is not itself escaped", () => {
    expect(escapeTerm('a\\b"c')).toBe('a\\\\b\\"c');
  });
});

describe("buildFilterInfo", () => {
  it("reports the value each filter actually resolved to", () => {
    const info = buildFilterInfo(
      effectiveValues({ language: "German" }, settings({ sort: "title" }))
    );
    expect(filterById(info, "sort")?.value).toBe("title");
    expect(filterById(info, "language")?.value).toBe("German");
    expect(filterById(info, "restricted")?.value).toBe("exclude");
  });

  it("never offers an empty option value, which the app's select rejects", () => {
    const info = buildFilterInfo(effectiveValues(undefined, settings()));
    const values = info.filters.flatMap((f) =>
      (f.options ?? []).map((o) => o.value)
    );
    expect(values.every((v) => v.length > 0)).toBe(true);
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
