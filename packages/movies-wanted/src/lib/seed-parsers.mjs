function decodeHtmlEntities(text) {
  return String(text ?? "")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function parseJsonScript(html, pattern) {
  const match = String(html ?? "").match(pattern);
  if (!match?.[1]) {
    return null;
  }

  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

export function parseRottenTomatoesBrowseJsonLd(html, minimumReviewCount = 0) {
  const parsed = parseJsonScript(
    html,
    /<script type="application\/ld\+json">\s*(\{[\s\S]*?\})\s*<\/script>/i
  );
  const items = parsed?.itemListElement?.itemListElement ?? [];

  return items
    .map((item) => item.item ?? item)
    .map((item) => {
      const year = Number(String(item?.dateCreated ?? "").match(/\b(19\d{2}|20\d{2})\b/)?.[1] ?? 0);
      const reviewCount = Number(item?.aggregateRating?.reviewCount ?? 0);
      const rtScore = Number(item?.aggregateRating?.ratingValue ?? 0);
      return {
        title: decodeHtmlEntities(item?.name ?? "").trim(),
        year,
        reviewCount,
        rtScore,
        rtUrl: item?.url ?? ""
      };
    })
    .filter((item) => item.title && item.year && item.reviewCount >= minimumReviewCount);
}

function parseYearFromCard(cardHtml) {
  const explicitYear = cardHtml.match(/data-title="[^"]+\((19\d{2}|20\d{2})\)"/i)?.[1];
  if (explicitYear) {
    return Number(explicitYear);
  }

  const slugYear = cardHtml.match(/href="\/movie\/[^"]*-(19\d{2}|20\d{2})\/"/i)?.[1];
  if (slugYear) {
    return Number(slugYear);
  }

  const releaseYear = cardHtml.match(/<span>(?:[A-Z][a-z]{2} \d{1,2}, )?(19\d{2}|20\d{2})<\/span>/)?.[1];
  return releaseYear ? Number(releaseYear) : null;
}

export function parseMetacriticBrowseCards(html) {
  const matches = [
    ...String(html ?? "").matchAll(
      /<a class="grid[\s\S]*?href="(\/movie\/[^"]+)"[\s\S]*?data-title="([^"]+)"[\s\S]*?<\/a>/g
    )
  ];

  return matches
    .map((match) => {
      const cardHtml = match[0];
      const rawTitle = decodeHtmlEntities(match[2]).trim();
      if (/re-release/i.test(rawTitle)) {
        return null;
      }

      const year = parseYearFromCard(cardHtml);
      const title = rawTitle.replace(/\s+\((19\d{2}|20\d{2})\)\s*$/i, "").trim();
      return {
        title,
        year,
        sourceUrl: `https://www.metacritic.com${match[1]}`
      };
    })
    .filter((item) => item?.title && item?.year);
}
