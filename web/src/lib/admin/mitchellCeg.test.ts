import { describe, expect, it } from "vitest";

import {
  MITCHELL_CEG_START_URL,
  buildMitchellCegRecords,
  extractMitchellCegLinks,
  extractMitchellCegText,
  mitchellCegUrlFromHref,
} from "./mitchellCeg";

describe("mitchellCegUrlFromHref", () => {
  it("accepts only Mitchell CEG content pages", () => {
    expect(mitchellCegUrlFromHref("ceg020100.htm", MITCHELL_CEG_START_URL)).toBe(
      "https://staticca.mymitchell.com/static/webhelp/ppages/ceg/1033/content/ceg020100.htm",
    );
    expect(mitchellCegUrlFromHref("../Skins/Default/Stylesheets/Topic.css", MITCHELL_CEG_START_URL)).toBeNull();
    expect(mitchellCegUrlFromHref("https://example.test/ceg020100.htm", MITCHELL_CEG_START_URL)).toBeNull();
  });
});

describe("extractMitchellCegLinks", () => {
  it("extracts allowed CEG links from a page", () => {
    const html = `
      <a href="ceg020100.htm">Front Bumper</a>
      <a href="../Skins/Default/Stylesheets/Topic.css">Ignore CSS</a>
      <a href="ceg020200.htm#included">Bumper and Grille</a>
    `;

    expect(extractMitchellCegLinks(html, MITCHELL_CEG_START_URL)).toEqual([
      "https://staticca.mymitchell.com/static/webhelp/ppages/ceg/1033/content/ceg020100.htm",
      "https://staticca.mymitchell.com/static/webhelp/ppages/ceg/1033/content/ceg020200.htm",
    ]);
  });
});

describe("extractMitchellCegText", () => {
  it("extracts main CEG content as readable markdown", () => {
    const html = `
      <html>
        <head><title>CEG: Procedure Explanations</title></head>
        <body>
          <nav>Navigation</nav>
          <div role="main" id="mc-main-content">
            <h1>Procedure Explanations</h1>
            <p>The Procedure Explanations are essential.</p>
          </div>
          <footer>Copyright</footer>
        </body>
      </html>
    `;

    expect(extractMitchellCegText(html)).toEqual({
      title: "Procedure Explanations",
      text: "# Procedure Explanations\n\nThe Procedure Explanations are essential.",
    });
  });
});

describe("buildMitchellCegRecords", () => {
  it("builds shop-doc records for a Mitchell CEG page", () => {
    const result = buildMitchellCegRecords({
      batchId: "mitchell-ceg-2026-05-02-223005",
      html: `
        <div role="main" id="mc-main-content">
          <h1>Procedure Explanations</h1>
          <p>The Procedure Explanations are essential.</p>
        </div>
      `,
      sourceUrl: MITCHELL_CEG_START_URL,
      maxChunkChars: 500,
    });

    expect(result.skippedReason).toBeNull();
    expect(result.records).toHaveLength(1);
    expect(result.records[0].source).toMatchObject({
      title: "Procedure Explanations",
      category: "Mitchell CEG",
      sourceRef: MITCHELL_CEG_START_URL,
      sourceUrl: MITCHELL_CEG_START_URL,
      fileType: "html",
      knowledgeType: "shop_doc",
      importedBatchId: "mitchell-ceg-2026-05-02-223005",
    });
  });
});
