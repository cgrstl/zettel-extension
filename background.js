const SERVER_URL = 'http://127.0.0.1:8080';

// Function to extract clean article text from a web page
function scrapePageWithReadability() {
  const article = new Readability(document.cloneNode(true)).parse();
  return {
    title: article.title,
    content: article.textContent
  };
}

// Main logic that runs when the extension icon is clicked
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.url || tab.url.startsWith('chrome://')) {
    console.log("Action ignored on internal Chrome pages.");
    return;
  }

  console.log(`Processing URL: ${tab.url}`);
  let dataToSend = {
    url: tab.url,
    title: tab.title, // Default title
    content: "" // Default empty content
  };

  try {
    const mainUrlPart = tab.url.split('?')[0].toLowerCase();

    // Case 1: It's a regular web page, not a PDF
    if (!mainUrlPart.endsWith('.pdf')) {
      console.log("Web page detected. Extracting article with Readability...");
      
      // Inject the Readability script into the page
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['Readability.js'],
      });
      
      // Execute our scraping function on the page
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: scrapePageWithReadability,
      });

      // Update data with the extracted content
      if (results && results[0] && results[0].result) {
        const article = results[0].result;
        dataToSend.title = article.title || tab.title;
        dataToSend.content = article.content || "";
      }
    } else {
        // Case 2: It's a PDF. We only need to send the URL and Title.
        // The backend will handle downloading and text extraction.
        console.log("PDF detected. Sending URL for backend processing.");
    }

    // --- Unified Fetch Call to the Single /ingest Endpoint ---
    console.log(`Sending data for "${dataToSend.title}" to the backend...`);
    const response = await fetch(`${SERVER_URL}/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dataToSend),
    });
    
    const result = await response.json();
    if (response.ok) {
        console.log("Successfully ingested:", result.message);
    } else {
        console.error("Ingestion failed:", result.message);
    }

  } catch (error) {
    console.error("An error occurred in the extension:", error);
  }
});
