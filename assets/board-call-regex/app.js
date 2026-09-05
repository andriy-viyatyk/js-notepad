const sourceElement = document.querySelector("#source");
const patternElement = document.querySelector("#pattern");
const flagsElement = document.querySelector("#flags");
const matchesElement = document.querySelector("#matches");
const statusElement = document.querySelector("#status");
let matches = [];

function showStatus(message) {
  statusElement.textContent = message;
}

function collectMatches(source, expression) {
  const found = [];
  if (!expression.global && !expression.sticky) {
    const match = expression.exec(source);
    if (match) found.push({ match: match[0], index: match.index });
    return found;
  }
  let match;
  while ((match = expression.exec(source)) !== null) {
    found.push({ match: match[0], index: match.index });
    if (match[0] === "") expression.lastIndex++;
  }
  return found;
}

document.querySelector("#run").addEventListener("click", async () => {
  try {
    const source = await window.persephone.call("page.grouped.content");
    const expression = new RegExp(patternElement.value, flagsElement.value);
    matches = collectMatches(String(source), expression);
    sourceElement.value = String(source);
    matchesElement.textContent = JSON.stringify(matches, null, 2);
    showStatus(`${matches.length} match(es)`);
  } catch (error) {
    showStatus(`Run failed: ${error?.message ?? error}`);
  }
});

document.querySelector("#write").addEventListener("click", async () => {
  try {
    await window.persephone.call("page.grouped.content", {
      value: JSON.stringify(matches, null, 2),
    });
    showStatus("Matches written to grouped content.");
  } catch (error) {
    showStatus(`Write failed: ${error?.message ?? error}`);
  }
});
