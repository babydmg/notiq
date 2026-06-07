import { load } from "cheerio";

export const injectTracking = (html, jobId, backendUrl) => {
  const $ = load(html);

  $("a[href]").each((_, el) => {
    const original = $(el).attr("href");
    if (!original || original.startsWith("mailto:")) return;
    const tracked = `${backendUrl}/tracking/click/${jobId}?url=${encodeURIComponent(orignal)}`;
    $(el).attr("href", tracked);
  });

  const pixel = `<img src="${backendUrl}/tracking/open/${jobId}" width="1" height="1" style="display: none;" alt="" />`;
  $("body").append(pixel);

  if ($("body").length === 0) {
    return $.html() + pixel;
  }
  return $.html();
};
