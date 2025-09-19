const SERVER_URL = 'http://127.0.0.1:8080';

// This function is injected into the webpage to extract its readable content.
function scrapePageWithReadability() {
  const article = new Readability(document.cloneNode(true)).parse();
  return {
    title: article.title,
    content: article.textContent
  };
}

// This is the main listener for when the user clicks the extension's icon.
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.url || tab.url.startsWith('chrome://')) {
    console.log("Action ignored on internal browser pages.");
    return;
  }

  // Prepare the data payload that will be sent to the backend.
  let data_to_send = {
    url: tab.url,
    title: tab.title, // Use the tab's title as an initial fallback.
    content: ""       // Content will be filled based on the page type.
  };

  try {
    const mainUrlPart = tab.url.split('?')[0];
    const isPdf = mainUrlPart.toLowerCase().endsWith('.pdf');

    if (isPdf) {
      console.log("PDF detected. Sending URL to backend for processing.");
      // For PDFs, we only need to send the URL and title.
      // The backend is responsible for downloading and extracting the text.
      // The 'content' field remains empty.
    } else {
      console.log("Webpage detected. Extracting article with Readability.js...");
      // For regular webpages, we execute Readability.js to get clean content.
      
      // 1. Inject the Readability.js library into the page.
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['Readability.js'],
      });
      
      // 2. Execute our scraping function on the page.
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: scrapePageWithReadability,
      });

      if (results && results[0] && results[0].result) {
        const article = results[0].result;
        data_to_send.title = article.title || tab.title;
        data_to_send.content = article.content || "";
      } else {
         console.warn("Readability could not extract an article. Attempting fallback to body text.");
         // Fallback if Readability fails: try to grab the raw body text.
         const fallbackResults = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => document.body.innerText,
        });
        if (fallbackResults && fallbackResults[0] && fallbackResults[0].result) {
            data_to_send.content = fallbackResults[0].result;
        }
      }
    }

    // --- Single, Unified Fetch Call ---
    console.log(`Sending "${data_to_send.title}" to the /ingest endpoint.`);
    const response = await fetch(`${SERVER_URL}/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data_to_send),
    });

    const result = await response.json();
    if (!response.ok) {
        throw new Error(result.message || `HTTP error! Status: ${response.status}`);
    }

    console.log("Backend response:", result.message);

  } catch (error) {
    console.error("An error occurred in the Zettel Hub Extension:", error);
    // Future improvement: Notify the user of the error via the UI.
  }
});