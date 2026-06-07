import * as cheerio from "cheerio";

export const injectTracking = (html, jobId, backendUrl) => {
  const $ = cheerio.load(html);

  // Replace all links with tracked versions
  $("a[href]").each((_, el) => {
    const original = $(el).attr("href");
    if (!original || original.startsWith("mailto:")) return;
    const tracked = `${backendUrl}/tracking/click/${jobId}?url=${encodeURIComponent(original)}`;
    $(el).attr("href", tracked);
  });

  // Inject open tracking pixel
  const pixel = `<img src="${backendUrl}/tracking/open/${jobId}" width="1" height="1" style="display:none;" alt="" />`;

  if ($("body").length > 0) {
    $("body").append(pixel);
  } else {
    return $.html() + pixel;
  }

  return $.html();
};
