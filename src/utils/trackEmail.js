export const injectTracking = (html, jobId, backendUrl) => {
  // Replace all href links with tracked versions
  const trackedHtml = html.replace(
    /href="(https?:\/\/[^"]+)"/gi,
    (match, url) => {
      // Skip unsubscribe links — don't double-wrap them
      if (url.includes("/contacts/unsubscribe")) return match;
      const tracked = `${backendUrl}/tracking/click/${jobId}?url=${encodeURIComponent(url)}`;
      return `href="${tracked}"`;
    },
  );

  // Inject open tracking pixel at the end
  const pixel = `<img src="${backendUrl}/tracking/open/${jobId}" width="1" height="1" style="display:none;" alt="" />`;

  return trackedHtml + pixel;
};
