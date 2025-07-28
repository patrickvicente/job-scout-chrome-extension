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

// Helper function to safely get text attributes from elements (including image alt text)
function getElementText(element, attribute = null) {
  try {
    if (!element) return '';
    
    if (attribute) {
      // Get attribute value (like alt text from images)
      return element.getAttribute(attribute) || '';
    } else {
      // Get text content
      return element.textContent.trim();
    }
  } catch (error) {
    console.warn('Error accessing element:', error);
    return '';
  }
}

// Extract raw HTML starting from .application-outlet
function extractRawHTML() {
  try {
    const applicationOutlet = document.querySelector('.application-outlet');
    if (applicationOutlet) {
      return applicationOutlet.outerHTML;
    } else {
      console.warn('No .application-outlet found on page');
      return null;
    }
  } catch (error) {
    console.error('Error extracting raw HTML:', error);
    return null;
  }
}


// Normalize source field to match enum values
function normalizeSource(sourceValue) {
  if (!sourceValue) return "extension";
  
  const sourceLower = sourceValue.toLowerCase();
  
  if (sourceLower.includes("seek")) {
    return "seek";
  } else if (sourceLower.includes("linkedin")) {
    return "linkedin";
  } else if (sourceLower.includes("jora")) {
    return "jora";
  } else if (sourceLower.includes("remoteok")) {
    return "remoteok";
  } else if (sourceLower.includes("cryptojobslist")) {
    return "cryptojobslist";
  } else if (sourceLower.includes("upwork")) {
    return "upwork";
  } else if (sourceLower.includes("angellist")) {
    return "angellist";
  } else {
    return "extension";
  }
}

function scrapeJobData(url, document, config, pattern) {
  const fields = config.scraper[pattern].job;
  let result = {};
  
  for (const field in fields) {
    const selector = fields[field];
    if (typeof selector === "string") {
      const el = document.querySelector(selector);
      result[field] = getElementText(el);
    } else if (Array.isArray(selector)) {
      // Handle array selectors (like the ones in jobs_config.json)
      let value = "";
      let currentElement = document;
      
      for (const step of selector) {
        if (typeof step === "string") {
          if (step === "domText") {
            value = getElementText(currentElement);
            break;
          } else if (step === "defaultString") {
            value = value || "";
            break;
          } else if (step.startsWith("domSelect")) {
            const match = step.match(/domSelect\("([^"]+)"\)/);
            if (match) {
              currentElement = currentElement.querySelector(match[1]);
            }
          } else if (step.startsWith("domGetAttribute")) {
            const match = step.match(/domGetAttribute\("([^"]+)"\)/);
            if (match && currentElement) {
              value = getElementText(currentElement, match[1]);
            }
          }
        }
      }
      result[field] = value;
    }
  }
  
  // Normalize the source field
  result.source = normalizeSource(pattern);
  result.url = url;
  return result;
}

async function extractAndSendJobData() {
  const config = await loadConfig();
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');
  const url = window.location.href;
  let jobData = null;

  // Extract raw HTML first
  const rawHTML = extractRawHTML();
  if (rawHTML) {
    console.log('Extracted raw HTML from .application-outlet');
  }

  scripts.forEach(script => {
    try {
      const data = JSON.parse(script.textContent);
      if (data["@type"] === "JobPosting") {
        jobData = data;
        // Set source for JSON-LD data based on URL
        if (url.includes('linkedin.com')) {
          jobData.source = 'linkedin';
        }
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
      console.log('Extracted job data using pattern:', pattern, 'Source:', jobData.source);
    }
  }
  
  // Add raw HTML to job data if available and source is LinkedIn
  if (rawHTML && jobData) {
    // Check if the source is LinkedIn (either from pattern matching or URL)
    const isLinkedIn = jobData.source === 'linkedin' || 
                      url.includes('linkedin.com') || 
                      url.includes('linkedin.com/jobs');
    
    if (isLinkedIn) {
      jobData.html_content = rawHTML;
      console.log('Added raw HTML content for LinkedIn job');
    } else {
      console.log('Not LinkedIn job, skipping HTML content. Source:', jobData.source, 'URL:', url);
    }
  }
  
  console.log("Extracted jobData:", jobData);
  
  // Check if job already exists in the database
  if (jobData && jobData.url) {
    console.log('Job data before existence check:', {
      url: jobData.url,
      title: jobData.title,
      company: jobData.company,
      source: jobData.source
    });
    
    try {
      // Validate URL format
      let urlToCheck = jobData.url;
      try {
        new URL(urlToCheck); // This will throw if URL is invalid
      } catch (urlError) {
        console.warn('Invalid URL format:', urlToCheck);
        // Try to fix common URL issues
        if (!urlToCheck.startsWith('http://') && !urlToCheck.startsWith('https://')) {
          urlToCheck = 'https://' + urlToCheck;
        }
      }
      
      const encodedUrl = encodeURIComponent(urlToCheck);
      console.log('Checking job existence for URL:', urlToCheck);
      console.log('Encoded URL:', encodedUrl);
      
      // Try the check-url endpoint
      let response = await fetch(`http://localhost:8000/jobs/check-url?url=${encodedUrl}`);
      console.log('Check URL response status:', response.status);
      
      // If that fails, try alternative endpoints
      if (!response.ok) {
        console.log('Trying alternative endpoint format...');
        // Try with different parameter name
        response = await fetch(`http://localhost:8000/jobs/check-url?job_url=${encodedUrl}`);
        console.log('Alternative endpoint response status:', response.status);
        
        if (!response.ok) {
          // Try POST request with JSON body
          console.log('Trying POST request...');
          response = await fetch(`http://localhost:8000/jobs/check-url`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ url: urlToCheck })
          });
          console.log('POST request response status:', response.status);
        }
      }
      
      console.log('Check URL response headers:', response.headers);
      
      if (!response.ok) {
        console.error('Check URL failed with status:', response.status);
        const errorText = await response.text();
        console.error('Error response:', errorText);
        throw new Error(`Server responded with ${response.status}: ${errorText}`);
      }
      
      const data = await response.json();
      
      // Add the existence check result to the job data
      jobData.exists = data.exists;
      jobData.existingJob = data.job;
      jobData.existingApplication = data.application;
      
      console.log("Job existence check:", data);
    } catch (error) {
      console.warn("Failed to check job existence:", error);
      // Continue without existence check if it fails
      jobData.exists = false;
    }
  } else {
    console.log('No job data or URL available for existence check');
  }
  
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

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "EXTRACT_RAW_HTML") {
    const rawHTML = extractRawHTML();
    if (rawHTML) {
      // Update the current job data with HTML content
      chrome.runtime.sendMessage({ type: "GET_JOB_DATA" }, (response) => {
        if (response && response.data) {
          const updatedJobData = { ...response.data, html_content: rawHTML };
          chrome.runtime.sendMessage({ type: "JOB_DATA", data: updatedJobData });
          sendResponse({ success: true, message: 'Raw HTML extracted and added to job data' });
        } else {
          sendResponse({ success: false, message: 'No job data available to update' });
        }
      });
    } else {
      sendResponse({ success: false, message: 'No .application-outlet found' });
    }
    return true; // Keep the message channel open for async response
  }
  if (message.type === "EXTRACT_JOB_DATA") {
    extractAndSendJobData();
    sendResponse({ success: true });
    return true;
  }
  if (message.type === "INJECT_COVER_LETTER") {
    try {
      // Find LinkedIn's cover letter textarea
      const coverLetterTextarea = document.querySelector('textarea[aria-label="Cover letter"]');
      
      if (coverLetterTextarea) {
        // Set the value and trigger input event to ensure LinkedIn's form validation works
        coverLetterTextarea.value = message.coverLetter;
        coverLetterTextarea.dispatchEvent(new Event('input', { bubbles: true }));
        coverLetterTextarea.dispatchEvent(new Event('change', { bubbles: true }));
        
        // Focus the textarea
        coverLetterTextarea.focus();
        
        sendResponse({ success: true, message: 'Cover letter injected successfully' });
      } else {
        // Try alternative selectors for LinkedIn's cover letter field
        const alternativeSelectors = [
          'textarea[id*="cover-letter"]',
          'textarea[id*="coverletter"]',
          'textarea[placeholder*="cover"]',
          'textarea[placeholder*="Cover"]',
          '.artdeco-text-input__textarea',
          'textarea.fb-multiline-text'
        ];
        
        let found = false;
        for (const selector of alternativeSelectors) {
          const textarea = document.querySelector(selector);
          if (textarea) {
            textarea.value = message.coverLetter;
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            textarea.dispatchEvent(new Event('change', { bubbles: true }));
            textarea.focus();
            found = true;
            break;
          }
        }
        
        if (found) {
          sendResponse({ success: true, message: 'Cover letter injected using alternative selector' });
        } else {
          sendResponse({ success: false, message: 'Cover letter textarea not found on page' });
        }
      }
    } catch (error) {
      console.error('Error injecting cover letter:', error);
      sendResponse({ success: false, message: `Error: ${error.message}` });
    }
    return true;
  }
});

extractAndSendJobData();