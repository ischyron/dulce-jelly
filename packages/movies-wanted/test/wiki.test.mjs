import test from "node:test";
import assert from "node:assert/strict";
import {
  extractFilmTitleFromTableCell,
  extractWinnerTitleFromHighlightedCell
} from "../src/lib/wiki.mjs";

test("extractWinnerTitleFromHighlightedCell returns BAFTA film title", () => {
  const line =
    `| style="background:#FAEB86"| '''''[[Christ Stopped at Eboli (film)|Christ Stopped at Eboli]]'''''`;
  assert.equal(extractWinnerTitleFromHighlightedCell(line), "Christ Stopped at Eboli");
});

test("extractWinnerTitleFromHighlightedCell ignores BAFTA director row", () => {
  const line = `| style="background:#FAEB86"| '''[[Francesco Rosi]]'''`;
  assert.equal(extractWinnerTitleFromHighlightedCell(line), null);
});

test("extractWinnerTitleFromHighlightedCell returns Spirit winner title", () => {
  const line =
    `| style="background:#B0C4DE" | '''''[[After Hours (film)|After Hours]]'''''`;
  assert.equal(extractWinnerTitleFromHighlightedCell(line), "After Hours");
});

test("extractWinnerTitleFromHighlightedCell ignores Spirit director row", () => {
  const line = `| style="background:#B0C4DE" | '''[[Martin Scorsese]]'''`;
  assert.equal(extractWinnerTitleFromHighlightedCell(line), null);
});

test("extractWinnerTitleFromHighlightedCell ignores British Film producer row", () => {
  const line = `| style="background:#FAEB86"| '''[[Stephen Woolley]]'''`;
  assert.equal(extractWinnerTitleFromHighlightedCell(line), null);
});

test("extractWinnerTitleFromHighlightedCell returns British Film winner title", () => {
  const line = `| style="background:#FAEB86"| '''''[[Shallow Grave]]'''''`;
  assert.equal(extractWinnerTitleFromHighlightedCell(line), "Shallow Grave");
});

test("extractFilmTitleFromTableCell returns BAFTA nominee title", () => {
  const line = `| ''[[The 400 Blows]]''`;
  assert.equal(extractFilmTitleFromTableCell(line), "The 400 Blows");
});

test("extractFilmTitleFromTableCell ignores BAFTA director row", () => {
  const line = `| [[Robert Rossen]]`;
  assert.equal(extractFilmTitleFromTableCell(line), null);
});

test("extractFilmTitleFromTableCell ignores country row", () => {
  const line = `| style="background:#FAEB86"| '''[[United States]]'''`;
  assert.equal(extractFilmTitleFromTableCell(line), null);
});
