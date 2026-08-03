import {
  buildFilterInfo,
  effectiveValues,
  ResolvedQuery,
  resolveQuery,
} from "./filters";
import {
  defaultSettings,
  FormatOption,
  MessageType,
  Settings,
  SortOption,
  UiMessageType,
} from "./shared";

const SEARCH_URL = "https://archive.org/advancedsearch.php";
const METADATA_URL = "https://archive.org/metadata/";
/**
 * Files must be fetched from `/cors/`, not `/download/`. `/download/` redirects
 * to a storage node that sends no Access-Control-Allow-Origin, so the bytes are
 * unreadable from the browser. `/cors/` serves the same file with CORS headers.
 */
const CORS_URL = "https://archive.org/cors/";
const THUMB_URL = "https://archive.org/services/img/";
const DETAILS_URL = "https://archive.org/details/";

/**
 * advancedsearch.php refuses any request where `page * rows` goes past this,
 * so results beyond it are simply unreachable and paging has to stop there.
 */
const DEEP_PAGING_LIMIT = 10000;

const SETTINGS_KEY = "settings";

export const getSettings = (): Settings => {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (!stored) return defaultSettings;
    return { ...defaultSettings, ...JSON.parse(stored) };
  } catch {
    return defaultSettings;
  }
};

const setSettings = (settings: Settings) => {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
};

interface CollectionDefinition {
  name: string;
  /** Archive.org query for the collection. Empty means all texts. */
  query: string;
  /** Sort that suits this collection, overriding the user's default. */
  sort?: SortOption;
}

const COLLECTIONS: CollectionDefinition[] = [
  { name: "Most Downloaded", query: "", sort: "downloads" },
  { name: "Recently Added", query: "", sort: "date" },
  { name: "Project Gutenberg", query: "collection:gutenberg" },
  { name: "Community Texts", query: "collection:opensource" },
  { name: "American Libraries", query: "collection:americana" },
  { name: "Folkscanomy", query: "collection:folkscanomy" },
  { name: "The Magazine Rack", query: "collection:magazine_rack" },
  { name: "Zines", query: "collection:zines" },
  { name: "The Manual Library", query: "collection:manuals" },
  { name: "Library of Congress", query: "collection:library_of_congress" },
];

export interface FeedQuery {
  query: string;
  sort?: SortOption;
}

const API_ID_SEPARATOR = "::";

export const buildApiId = (feedQuery: FeedQuery): string =>
  `${feedQuery.sort ?? ""}${API_ID_SEPARATOR}${feedQuery.query}`;

export const parseApiId = (apiId?: string): FeedQuery => {
  if (!apiId) return { query: "" };
  const index = apiId.indexOf(API_ID_SEPARATOR);
  if (index === -1) return { query: apiId };
  return {
    sort: (apiId.slice(0, index) || undefined) as SortOption | undefined,
    query: apiId.slice(index + API_ID_SEPARATOR.length),
  };
};

const formatClause = (format: FormatOption) => {
  switch (format) {
    case "epub":
      return 'format:"EPUB"';
    case "pdf":
      return 'format:"PDF"';
    default:
      return '(format:"EPUB" OR format:"PDF")';
  }
};

/**
 * Composes the Archive.org query. Both the collection and the user's search
 * terms are optional, and everything is constrained to texts that actually have
 * a file ReaderGata can open.
 */
export const buildQuery = (
  bases: (string | undefined)[],
  resolved: ResolvedQuery
): string => {
  const parts = bases
    .filter((base): base is string => !!base && base.trim().length > 0)
    .map((base) => `(${base})`);
  parts.push("mediatype:texts");
  if (!resolved.includeRestricted) {
    parts.push("-access-restricted-item:true");
  }
  parts.push(formatClause(resolved.format));
  parts.push(...resolved.clauses);
  return parts.join(" AND ");
};

export const toArray = <T>(value: T | T[] | undefined): T[] => {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
};

interface SearchDoc {
  identifier: string;
  title?: string;
  creator?: string | string[];
  description?: string | string[];
  year?: number;
  format?: string | string[];
}

export const docToPublication = (doc: SearchDoc): Publication => {
  const formats = toArray(doc.format);
  const sources: PublicationSource[] = [];
  if (formats.includes("EPUB")) {
    sources.push({
      name: "EPUB",
      source: buildSourceToken(doc.identifier, "epub"),
      type: "application/epub+zip",
    });
  }
  if (formats.some((format) => format.endsWith("PDF"))) {
    sources.push({
      name: "PDF",
      source: buildSourceToken(doc.identifier, "pdf"),
      type: "application/pdf",
    });
  }

  const authors = toArray(doc.creator).map((name): Author => ({ name }));

  return {
    title: doc.title ?? doc.identifier,
    apiId: doc.identifier,
    summary: toArray(doc.description).join("\n\n") || undefined,
    authors: authors.length > 0 ? authors : undefined,
    images: [{ url: `${THUMB_URL}${encodeURIComponent(doc.identifier)}` }],
    sources,
    originalUrl: `${DETAILS_URL}${encodeURIComponent(doc.identifier)}`,
  };
};

type PublicationKind = "epub" | "pdf";

const SOURCE_SEPARATOR = "|";

/**
 * `PublicationSource.source` is opaque to ReaderGata — it is handed straight
 * back to `onGetPublication`. Resolving the real filename needs a per-item
 * metadata request, so defer that until the user actually opens something
 * rather than doing it for every result on a page.
 */
export const buildSourceToken = (
  identifier: string,
  kind: PublicationKind
): string => `${identifier}${SOURCE_SEPARATOR}${kind}`;

export const parseSourceToken = (
  source: string
): { identifier: string; kind: PublicationKind } => {
  const index = source.lastIndexOf(SOURCE_SEPARATOR);
  if (index === -1) {
    throw new Error(`Unrecognized source: ${source}`);
  }
  return {
    identifier: source.slice(0, index),
    kind: source.slice(index + 1) as PublicationKind,
  };
};

export interface ArchiveFile {
  name: string;
  format?: string;
  size?: string;
}

const PDF_FORMAT_PREFERENCE = ["Text PDF", "Image Container PDF"];

export const pickFile = (
  files: ArchiveFile[] | undefined,
  kind: PublicationKind
): ArchiveFile | undefined => {
  const candidates = (files ?? []).filter((file) => !!file.name);
  if (kind === "epub") {
    return candidates.find((file) => file.format === "EPUB");
  }

  // Bitonal scans are a much worse read than the regular pdf, and both are
  // present on a lot of scanned items.
  const pdfs = candidates.filter(
    (file) =>
      (file.format ?? "").endsWith("PDF") && !file.name.endsWith("_bw.pdf")
  );
  for (const format of PDF_FORMAT_PREFERENCE) {
    const match = pdfs.find((file) => file.format === format);
    if (match) return match;
  }
  return pdfs[0];
};

/**
 * Archive.org sends `Access-Control-Allow-Origin` on every endpoint this plugin
 * uses, so no proxy is needed. The fallback only exists for users whose network
 * blocks archive.org directly and who have configured a proxy in settings.
 */
const networkFetch = async (url: string): Promise<Response> => {
  try {
    return await application.networkRequest(url);
  } catch (error) {
    const proxy = await application.getCorsProxy();
    if (!proxy) throw error;
    return await fetch(`${proxy}${encodeURIComponent(url)}`);
  }
};

const FIELDS = [
  "identifier",
  "title",
  "creator",
  "description",
  "year",
  "format",
];

export const buildSearchUrl = (
  query: string,
  sort: string | undefined,
  rows: number,
  offset: number
): string => {
  const params = new URLSearchParams();
  params.set("q", query);
  for (const field of FIELDS) {
    params.append("fl[]", field);
  }
  if (sort) {
    params.append("sort[]", sort);
  }
  params.set("rows", String(rows));
  params.set("page", String(Math.floor(offset / rows) + 1));
  params.set("output", "json");
  return `${SEARCH_URL}?${params.toString()}`;
};

interface SearchResponse {
  error?: string;
  response?: {
    numFound: number;
    start: number;
    docs: SearchDoc[];
  };
}

const searchFeed = async (
  feedQuery: FeedQuery,
  userQuery: string | undefined,
  requestedPage: PageInfo | undefined,
  chosenFilters: Record<string, string> | undefined
): Promise<Feed> => {
  const settings = getSettings();
  const rows = Math.min(Math.max(settings.resultsPerPage, 1), 100);
  // Anything past the deep paging limit is unreachable, so never ask for it.
  const maxOffset = Math.max(0, DEEP_PAGING_LIMIT - rows);
  const offset = Math.min(Math.max(requestedPage?.offset ?? 0, 0), maxOffset);

  const values = effectiveValues(chosenFilters, settings, feedQuery.sort);
  const resolved = resolveQuery(values);
  const query = buildQuery([feedQuery.query, userQuery], resolved);

  const response = await networkFetch(
    buildSearchUrl(query, resolved.sort, rows, offset)
  );
  const json: SearchResponse = await response.json();
  if (json.error) {
    throw new Error(json.error);
  }
  if (!json.response) {
    throw new Error("Unexpected response from the Internet Archive");
  }

  return {
    type: "publication",
    items: json.response.docs.map(docToPublication),
    hasSearch: true,
    filterInfo: buildFilterInfo(values),
    pageInfo: {
      // Results past the deep paging limit cannot be fetched, so reporting the
      // real count here would leave "next page" enabled onto a page that errors.
      totalResults: Math.min(json.response.numFound, DEEP_PAGING_LIMIT),
      resultsPerPage: rows,
      offset,
    },
  };
};

application.onGetFeed = async (request: GetFeedRequest): Promise<Feed> => {
  if (!request.apiId) {
    // The collection list itself has nothing to filter, so it advertises none.
    return {
      type: "catalog",
      items: COLLECTIONS.map(
        (collection): Catalog => ({
          name: collection.name,
          apiId: buildApiId(collection),
        })
      ),
      hasSearch: true,
    };
  }

  return searchFeed(
    parseApiId(request.apiId),
    undefined,
    request.pageInfo,
    request.filters
  );
};

application.onSearch = async (request: SearchRequest): Promise<Feed> =>
  searchFeed(
    parseApiId(request.apiId),
    request.query,
    request.pageInfo,
    request.filters
  );

export const blobToString = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (res) => {
      resolve(res.target?.result as string);
    };
    reader.onerror = (err) => reject(err);
    reader.readAsBinaryString(blob);
  });
};

application.onGetPublication = async (
  request: GetPublicationRequest
): Promise<GetPublicationResponse> => {
  const { identifier, kind } = parseSourceToken(request.source);
  const metadataResponse = await networkFetch(
    `${METADATA_URL}${encodeURIComponent(identifier)}`
  );
  const metadata: { files?: ArchiveFile[] } = await metadataResponse.json();
  const file = pickFile(metadata.files, kind);
  if (!file) {
    throw new Error(`No ${kind} file available for ${identifier}`);
  }

  const fileUrl = `${CORS_URL}${encodeURIComponent(identifier)}/${file.name
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
  const fileResponse = await networkFetch(fileUrl);
  const blob = await fileResponse.blob();

  return {
    source: await blobToString(blob),
    sourceType: "binary",
  };
};

const sendMessage = (message: MessageType) => {
  application.postUiMessage(message);
};

application.onUiMessage = async (message: UiMessageType) => {
  switch (message.type) {
    case "get-settings":
      sendMessage({ type: "settings", settings: getSettings() });
      break;
    case "save-settings":
      setSettings(message.settings);
      application.createNotification({ message: "Save successful" });
      break;
    default:
      const _exhaustive: never = message;
      break;
  }
};

const changeTheme = (theme: Theme) => {
  localStorage.setItem("vite-ui-theme", theme);
};

application.onChangeTheme = async (theme: Theme) => {
  changeTheme(theme);
};

const init = async () => {
  const theme = await application.getTheme();
  changeTheme(theme);
};

init();
