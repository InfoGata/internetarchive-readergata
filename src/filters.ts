import { FormatOption, Settings, SortOption } from "./shared";

/**
 * Filters ReaderGata shows above a feed. The user's options-page settings are
 * the starting point — a filter left untouched behaves exactly as before — and
 * a value chosen here overrides them for this feed only.
 */

/**
 * archive.org `sort[]` expressions. Relevance is the absence of a sort, which
 * is what advancedsearch.php falls back to.
 */
export const SORTS: Record<SortOption, string | undefined> = {
  relevance: undefined,
  downloads: "downloads desc",
  date: "addeddate desc",
  title: "titleSorter asc",
};

/**
 * Languages offered in the dropdown. Values are the strings archive.org stores
 * in its `language` field. That field is free text and inconsistently filled
 * in, so this narrows results rather than guaranteeing them.
 */
const LANGUAGES = [
  "English",
  "French",
  "German",
  "Spanish",
  "Italian",
  "Portuguese",
  "Russian",
  "Chinese",
  "Japanese",
  "Arabic",
];

/**
 * The "no preference" value. It cannot be the empty string: ReaderGata renders
 * these options with a Radix select, which reserves "" for "nothing selected"
 * and throws on an option that uses it.
 */
export const ANY = "any";

export interface FilterValues {
  sort: SortOption;
  format: FormatOption;
  restricted: "include" | "exclude";
  language: string;
  creator: string;
  yearFrom: string;
  yearTo: string;
}

const isSort = (value: string | undefined): value is SortOption =>
  !!value && value in SORTS;

const isFormat = (value: string | undefined): value is FormatOption =>
  value === "any" || value === "epub" || value === "pdf";

/**
 * Resolves what each filter is actually set to, in precedence order: what the
 * user chose, then the sort the collection prefers, then their settings.
 */
export const effectiveValues = (
  chosen: Record<string, string> | undefined,
  settings: Settings,
  collectionSort?: SortOption
): FilterValues => {
  const sort = chosen?.sort;
  const format = chosen?.format;
  return {
    sort: isSort(sort) ? sort : (collectionSort ?? settings.sort),
    format: isFormat(format) ? format : settings.format,
    restricted:
      chosen?.restricted === "include" || chosen?.restricted === "exclude"
        ? chosen.restricted
        : settings.includeRestricted
          ? "include"
          : "exclude",
    language: chosen?.language || ANY,
    creator: chosen?.creator ?? "",
    yearFrom: chosen?.yearFrom ?? "",
    yearTo: chosen?.yearTo ?? "",
  };
};

/**
 * The declaration ReaderGata renders, with every filter reporting the value the
 * results were actually built from, so the controls open showing the truth even
 * when the url says nothing.
 */
export const buildFilterInfo = (values: FilterValues): FilterInfo => ({
  filters: [
    {
      id: "sort",
      displayName: "Sort by",
      type: "select",
      value: values.sort,
      options: [
        { displayName: "Relevance", value: "relevance" },
        { displayName: "Most downloaded", value: "downloads" },
        { displayName: "Recently added", value: "date" },
        { displayName: "Title A-Z", value: "title" },
      ],
    },
    {
      id: "format",
      displayName: "Format",
      type: "radio",
      value: values.format,
      options: [
        { displayName: "Any", value: ANY },
        { displayName: "EPUB", value: "epub" },
        { displayName: "PDF", value: "pdf" },
      ],
    },
    {
      id: "restricted",
      displayName: "Lending-restricted items",
      type: "radio",
      value: values.restricted,
      options: [
        { displayName: "Hide", value: "exclude" },
        { displayName: "Include", value: "include" },
      ],
    },
    {
      id: "language",
      displayName: "Language",
      type: "select",
      value: values.language,
      options: [
        { displayName: "Any", value: ANY },
        ...LANGUAGES.map((language) => ({
          displayName: language,
          value: language,
        })),
      ],
    },
    {
      id: "creator",
      displayName: "Author",
      type: "text",
      value: values.creator,
    },
    {
      id: "yearFrom",
      displayName: "Year from",
      type: "text",
      value: values.yearFrom,
    },
    {
      id: "yearTo",
      displayName: "Year to",
      type: "text",
      value: values.yearTo,
    },
  ],
});

/**
 * Escapes a value going into a quoted phrase. The user's own search terms are
 * left alone on purpose so archive.org field syntax keeps working, but filter
 * values are interpolated into `field:"..."` and must not break out of it.
 */
export const escapeTerm = (value: string): string =>
  value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

/** Years archive.org will accept in a range. Anything else is ignored. */
const asYear = (value: string): string | undefined =>
  /^\d{3,4}$/.test(value.trim()) ? value.trim() : undefined;

/** What the filters mean for the actual request. */
export interface ResolvedQuery {
  /** archive.org `sort[]` expression, or undefined for relevance. */
  sort: string | undefined;
  format: FormatOption;
  includeRestricted: boolean;
  /** Query clauses the filters contribute, already escaped. */
  clauses: string[];
}

export const resolveQuery = (values: FilterValues): ResolvedQuery => {
  const clauses: string[] = [];

  if (values.language !== ANY) {
    clauses.push(`language:"${escapeTerm(values.language)}"`);
  }

  const creator = values.creator.trim();
  if (creator) {
    clauses.push(`creator:"${escapeTerm(creator)}"`);
  }

  const from = asYear(values.yearFrom);
  const to = asYear(values.yearTo);
  if (from || to) {
    clauses.push(`year:[${from ?? "*"} TO ${to ?? "*"}]`);
  }

  return {
    sort: SORTS[values.sort],
    format: values.format,
    includeRestricted: values.restricted === "include",
    clauses,
  };
};
