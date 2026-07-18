import fs from 'fs';

let content = fs.readFileSync('svelte_data.json', 'utf-8');
// It's encoded as an array: data-sveltekit-fetched="[...]"
try {
  let parsed = JSON.parse(content);
  // It's a sveltekit data structure, usually [{status:200, data:...}, ...]
  // Just dump keys or search for Boss/Event strings
  console.log("Parsed JSON array of length:", parsed.length);
  for (let item of parsed) {
    if (typeof item === 'object' && item !== null) {
      const str = JSON.stringify(item);
      if (str.includes("Event") || str.includes("Boss")) {
        console.log("Found event data:", str.substring(0, 500));
        // fs.writeFileSync('events.json', str);
      }
    }
  }
} catch (e) {
  console.log("Not pure JSON, string search:");
  let idx = content.indexOf('Boss');
  if (idx !== -1) console.log(content.substring(idx-100, idx+500));
}
