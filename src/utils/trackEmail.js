export const injectTracking = (html, jobId, backendUrl) => {
  const trackedHtml = html.replace(
    /href="(https?:\/\/[^"]+)"/gi,
    (match, url) => {
      if (url.includes("/contacts/unsubscribe")) return match;
      const tracked = `${backendUrl}/tracking/click/${jobId}?url=${encodeURIComponent(url)}`;
      return `href="${tracked}"`;
    },
  );

  const pixel = `<img src="${backendUrl}/tracking/open/${jobId}" width="1" height="1" style="display:none;" alt="" />`;

  return trackedHtml + pixel;
};
