# internetarchive-readergata

A [readergata](https://github.com/InfoGata/readergata) plugin for the [Internet Archive](https://archive.org).

[Installation Link](https://www.readergata.com/plugininstall?manifestUrl=https://cdn.jsdelivr.net/gh/InfoGata/internetarchive-readergata@latest/manifest.json)

Browse curated Archive.org text collections, search all of them, and read the
EPUBs and PDFs in ReaderGata.

Books are downloaded through `https://archive.org/cors/`, which sends CORS
headers, so unlike the other ReaderGata plugins this one needs neither a CORS
proxy nor the [InfoGata extension](https://github.com/InfoGata/infogata-extension).

Lending-restricted items are excluded by default because they are DRM protected
and will not open. That can be changed on the plugin's options page, along with
the page size, sort order, and whether to list EPUB, PDF, or both.
