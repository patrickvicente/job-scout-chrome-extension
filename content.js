async function loadConfig() {
  const response = await fetch(chrome.runtime.getURL('jobs_config.json'));
  return await response.json();
}

function isSupportedJobSite(url, config) {
  for (const pattern in config.scraper) {
    const regex = new RegExp(pattern);
    if (regex.test(url)) {
      return pattern;
    }
  }
  return null;
}

function scrapeJobData(url, document, config, pattern) {
  const fields = config.scraper[pattern].job;
  let result = {};
  for (const field in fields) {
    const selector = fields[field];
    if (typeof selector === "string") {
      const el = document.querySelector(selector);
      result[field] = el ? el.textContent.trim() : "";
    }
    // TO DO: Handle array selectors if needed
  }
  result.source = pattern;
  result.url = url;
  return result;
}

async function extractAndSendJobData() {
  const config = await loadConfig();
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');
  const url = window.location.href;
  let jobData = null;

  scripts.forEach(script => {
    try {
      const data = JSON.parse(script.textContent);
      if (data["@type"] === "JobPosting") {
        jobData = data;
      }
    } catch (e) {
      // Ignore
    }
  });

  // Fallback: Config-driven DOM extraction
  if (!jobData) {
    const pattern = isSupportedJobSite(url, config);
    if (pattern) {
      jobData = scrapeJobData(url, document, config, pattern);
    }
  }
  
  console.log("Extracted jobData:", jobData);
  chrome.runtime.sendMessage({ type: "JOB_DATA", data: jobData });
};

// Watch URL changes (SPA navigation)
function watchUrlChange() {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    // Wait a short time for DOM to update, then extract
    setTimeout(extractAndSendJobData, 500); // Adjust delay as needed
  }
}

// Listen for SPA navigation events
window.addEventListener('popstate', extractAndSendJobData);
window.addEventListener('pushState', extractAndSendJobData);

// Monkey-patch pushState/replaceState for full SPA support
(function(history){
    var pushState = history.pushState;
    history.pushState = function(state) {
        var ret = pushState.apply(history, arguments);
        window.dispatchEvent(new Event('pushState'));
        return ret;
    };
    var replaceState = history.replaceState;
    history.replaceState = function(state) {
        var ret = replaceState.apply(history, arguments);
        window.dispatchEvent(new Event('pushState'));
        return ret;
    };
})(window.history);

extractAndSendJobData();