let latestJobData = null;
let jobDataByTab = {};

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "JOB_DATA") {
    if (sender.tab && sender.tab.id !== undefined) {
      jobDataByTab[sender.tab.id] = message.data;
    }
  }
  if (message.type === "GET_JOB_DATA") {
    chrome.tabs.query({ active: true, currentWindow: true}, (tabs) => {
      const tabId = tabs[0]?.id;
      sendResponse({ data: jobDataByTab[tabId] } || null);
    });
    // Return true to indicate async response
    return true;
  }
  // Extract raw HTML from the active tab
  if (message.type === "EXTRACT_RAW_HTML") {
    chrome.tabs.query({ active: true, currentWindow: true}, (tabs) => {
      const tabId = tabs[0]?.id;
      if (tabId) {
        chrome.tabs.sendMessage(tabId, { type: "EXTRACT_RAW_HTML" }, (response) => {
          sendResponse(response);
        });
      } else {
        sendResponse({ success: false, message: 'No active tab found' });
      }
    });
    return true; // Keep the message channel open for async response
  }
});

// Open the side panel when the extension icon is clicked
chrome.action.onClicked.addListener(() => {
  chrome.windows.getCurrent({}, (window) => {
    if (window && chrome.sidePanel && chrome.sidePanel.open) {
      chrome.sidePanel.open({ windowId: window.id });
    }
  });
});

// Extract job data from the active tab
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  if (tabs[0]?.id) {
    chrome.tabs.sendMessage(tabs[0].id, { type: "EXTRACT_JOB_DATA" });
  }
});

// Clean up when a tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  delete jobDataByTab[tabId];
});

// listen for tab changes
chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.runtime.sendMessage({ type: "TAB_CHANGED", tabId: activeInfo.tabId });
});