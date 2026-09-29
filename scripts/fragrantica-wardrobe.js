// Run on a Fragrantica profile (https://www.fragrantica.com/@name#wardrobe),
// e.g. via Claude in Chrome's javascript tool, to list the perfume pages on its
// "Perfumes I Have" shelf. Read each page with scripts/fragrantica-extract.js.
// `expected` is the shelf's own count; fewer `pages` means it didn't all load.
const sleep = ms => new Promise(r => setTimeout(r, ms));
[...document.querySelectorAll('[role="tab"], button')].find(b => /^wardrobe$/i.test(b.textContent.trim()))?.click();

let heading;
for (let i = 0; i < 20 && !heading; i++) {
  heading = [...document.querySelectorAll('h1, h2, h3, h4')].find(e => /^Perfumes I Have/i.test(e.textContent.trim()));
  if (!heading) await sleep(250);
}

// The shelf is the nearest ancestor of its heading that holds perfume links.
let box = heading, pages = [];
for (let i = 0; i < 6 && box && !pages.length; i++) {
  box = box.parentElement;
  pages = [...new Set([...box.querySelectorAll('a[href*="/perfume/"]')].map(a => a.getAttribute('href').replace(/^https?:\/\/[^/]+/, '')))];
}

JSON.stringify({
  profile: location.pathname,
  expected: parseInt(heading?.textContent.match(/\d+/)?.[0] ?? '', 10) || null,
  found: pages.length,
  pages,
});
