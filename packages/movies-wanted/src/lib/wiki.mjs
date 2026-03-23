export function stripWikiMarkup(text) {
  return String(text ?? "")
    .replace(/<ref[^>]*>.*?<\/ref>/g, "")
    .replace(/<ref[^/>]*\/>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/'''''/g, "")
    .replace(/'''/g, "")
    .replace(/''/g, "")
    .replace(/\{\{.*?\}\}/g, "")
    .replace(/\[\[([^|\]]+)\|([^|\]]+)\]\]/g, "$2")
    .replace(/\[\[([^|\]]+)\]\]/g, "$1")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractTitleFromWikilink(fragment) {
  const match = String(fragment ?? "").match(/\[\[([^|\]]+)\|([^|\]]+)\]\]|\[\[([^|\]]+)\]\]/);
  if (!match) {
    return null;
  }

  return stripWikiMarkup(match[2] ?? match[3] ?? match[1]);
}

export function extractWinnerTitleFromHighlightedCell(line) {
  const match = String(line ?? "").match(/'''''(\[\[[^\]]+\]\])'''''/);
  if (!match) {
    return null;
  }

  return extractTitleFromWikilink(match[1]);
}

export function extractFilmTitleFromTableCell(line) {
  const match = String(line ?? "").match(
    /^\|\s*(?:style="background:[^"]+"\|\s*)?(?:\{\{sort\|[^|]+\|)?''(?:''|)(\[\[[^\]]+\]\])''(?:''|)/
  );
  if (!match) {
    return null;
  }

  return extractTitleFromWikilink(match[1]);
}
