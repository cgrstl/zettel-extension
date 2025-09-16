const SERVER_URL = 'http://127.0.0.1:8080';

// Funktion zum Extrahieren des sauberen Artikel-Textes
function scrapePageWithReadability() {
  // Readability wird über `executeScript` in die Seite geladen und ist hier global verfügbar
  const article = new Readability(document.cloneNode(true)).parse();
  return {
    title: article.title,
    content: article.textContent
  };
}

// Lauscht auf Klicks auf das Erweiterungs-Icon
chrome.action.onClicked.addListener(async (tab) => {
  // Ignoriere interne Chrome-Seiten
  if (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://')) {
    console.log("Aktion auf interner Seite ignoriert.");
    return;
  }

  try {
    // Fall 1: Die URL ist eine PDF-Datei
    if (tab.url.toLowerCase().endsWith('.pdf')) {
      console.log("PDF erkannt. Sende URL an /ingest-pdf...");
      await fetch(`${SERVER_URL}/ingest-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: tab.url }),
      });
      console.log("PDF-URL erfolgreich gesendet.");

    // Fall 2: Es ist eine normale Webseite
    } else {
      console.log("Webseite erkannt. Extrahiere Artikel mit Readability...");
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['Readability.js'],
      });
      
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: scrapePageWithReadability,
      });

      // --- NEUE FEHLERPRÜFUNG HINZUGEFÜGT ---
      if (!results || !results[0] || !results[0].result) {
        console.error("Konnte keinen Inhalt von der Seite extrahieren. Das Skript gab kein Ergebnis zurück.");
        return; // Breche die Ausführung hier ab, um weitere Fehler zu vermeiden
      }
      // -----------------------------------------

      const article = results[0].result;
      const data = {
        url: tab.url,
        title: article.title || "Kein Titel gefunden",
        content: article.content || "Kein Inhalt extrahierbar."
      };

      await fetch(`${SERVER_URL}/ingest-web`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      console.log(`Artikel "${data.title}" erfolgreich gesendet.`);
    }
  } catch (error) {
    console.error("Fehler in der Zettel-Erweiterung:", error);
  }
});