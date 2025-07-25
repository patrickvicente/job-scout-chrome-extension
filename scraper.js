async function loadConfig() {
    const response = await fetch(chrome.runtime.getURL('jobs_config.json'));
    return await response.json();
  }

function isSupportedJobSite(url, config) {
  for (const pattern in config.scraper) {
    const regex = new RegExp(pattern);
    if (regex.test(url)) {
      return true;
    }
  }
  return false;
}

function scrapeJobData(url, document, config) {
  for (const pattern in config.scraper) {
    if (new RegExp(pattern).test(url)) {
      const fields = config.scraper[pattern].job;
      let result = {};
      for (const field in fields) {
        const selector = fields[field];
        // Simple selector
        if (typeof selector === "string") {
          const el = document.querySelector(selector);
          result[field] = el ? el.textContent.trim() : "";
        }
        // (Handle array selectors if needed)
      }
      return result;
    }
  }
  return null;
}