import test from "node:test";
import assert from "node:assert/strict";
import {
  parseMetacriticBrowseCards,
  parseRottenTomatoesBrowseJsonLd
} from "../src/lib/seed-parsers.mjs";

test("parseRottenTomatoesBrowseJsonLd extracts seeded browse items with review floor", () => {
  const html = `
    <script type="application/ld+json">
      {
        "@context":"http://schema.org",
        "@type":"ItemList",
        "itemListElement":{
          "@type":"ItemList",
          "itemListElement":[
            {
              "@type":"Movie",
              "name":"A Real Movie",
              "dateCreated":"2024",
              "url":"https://www.rottentomatoes.com/m/a_real_movie",
              "aggregateRating":{"ratingValue":"91","reviewCount":42}
            },
            {
              "@type":"Movie",
              "name":"Too Few Reviews",
              "dateCreated":"2024",
              "url":"https://www.rottentomatoes.com/m/too_few_reviews",
              "aggregateRating":{"ratingValue":"98","reviewCount":5}
            }
          ]
        }
      }
    </script>
  `;

  assert.deepEqual(parseRottenTomatoesBrowseJsonLd(html, 20), [
    {
      title: "A Real Movie",
      year: 2024,
      reviewCount: 42,
      rtScore: 91,
      rtUrl: "https://www.rottentomatoes.com/m/a_real_movie"
    }
  ]);
});

test("parseMetacriticBrowseCards extracts movie cards and skips re-releases", () => {
  const html = `
    <div data-testid="filter-results">
      <a class="grid grid-cols-[5.5rem_auto]" href="/movie/first-cow/" target="_self">
        <div class="relative transition-opacity mb-1 group" data-title="First Cow">
          <h3 data-testid="product-title"><span>1. </span><span>First Cow</span></h3>
        </div>
        <div><span>Mar 6, 2020</span></div>
      </a>
    </div>
    <div data-testid="filter-results">
      <a class="grid grid-cols-[5.5rem_auto]" href="/movie/lawrence-of-arabia-re-release/" target="_self">
        <div class="relative transition-opacity mb-1 group" data-title="Lawrence of Arabia (re-release)">
          <h3 data-testid="product-title"><span>2. </span><span>Lawrence of Arabia (re-release)</span></h3>
        </div>
        <div><span>Aug 1, 2025</span></div>
      </a>
    </div>
    <div data-testid="filter-results">
      <a class="grid grid-cols-[5.5rem_auto]" href="/movie/moonlight-2016/" target="_self">
        <div class="relative transition-opacity mb-1 group" data-title="Moonlight">
          <h3 data-testid="product-title"><span>3. </span><span>Moonlight</span></h3>
        </div>
      </a>
    </div>
  `;

  assert.deepEqual(parseMetacriticBrowseCards(html), [
    {
      title: "First Cow",
      year: 2020,
      sourceUrl: "https://www.metacritic.com/movie/first-cow/"
    },
    {
      title: "Moonlight",
      year: 2016,
      sourceUrl: "https://www.metacritic.com/movie/moonlight-2016/"
    }
  ]);
});
