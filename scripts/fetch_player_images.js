const https = require('https');
const fs = require('fs');
const path = require('path');

const imageMapPath = path.join(__dirname, '..', 'data', 'player_images.json');
let imageMap = {};
if (fs.existsSync(imageMapPath)) {
  imageMap = JSON.parse(fs.readFileSync(imageMapPath, 'utf8'));
}

const players = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'players.json'), 'utf8'));
const legends = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'legends.json'), 'utf8'));

function fetchUrl(url) {
  return new Promise((resolve) => {
    https.get(url, { headers: { 'User-Agent': 'AuctionYards/2.0 (cricket-auction; contact@auctionyards.com)' } }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          resolve(JSON.parse(d));
        } catch(e) { resolve(null); }
      });
    }).on('error', () => resolve(null));
  });
}

async function run() {
  console.log('Starting fast batch image lookup. Initial count:', Object.keys(imageMap).length);

  // 1. Gather all candidates
  const playerItems = [];
  for (const l of legends) {
    if (!imageMap[l.id]) playerItems.push({ id: l.id, name: l.name });
  }
  for (const p of players) {
    const id = Array.isArray(p) ? p[0] : p.id;
    const name = Array.isArray(p) ? p[1] : p.name;
    if (!imageMap[id]) playerItems.push({ id, name });
  }

  console.log('Candidates to search:', playerItems.length);

  // Check candidates with search
  const batchSize = 10;
  for (let i = 0; i < playerItems.length; i += batchSize) {
    const batch = playerItems.slice(i, i + batchSize);
    await Promise.all(batch.map(async (item) => {
      try {
        // Step A: Search for cricket article
        const searchJson = await fetchUrl('https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=' + encodeURIComponent(item.name + ' cricketer') + '&format=json');
        const hits = searchJson?.query?.search || [];
        let matchedTitle = hits.length > 0 ? hits[0].title : item.name;

        // Step B: Query pageimage for matchedTitle and item.name
        const titlesToQuery = [matchedTitle, item.name, item.name + ' (cricketer)'].join('|');
        const imgJson = await fetchUrl('https://en.wikipedia.org/w/api.php?action=query&titles=' + encodeURIComponent(titlesToQuery) + '&prop=pageimages&pithumbsize=360&format=json');
        
        const pages = imgJson?.query?.pages || {};
        for (const pid of Object.keys(pages)) {
          const thumb = pages[pid]?.thumbnail?.source;
          if (thumb) {
            imageMap[item.id] = thumb;
            console.log('✓ Found image for:', item.name, 'via', pages[pid]?.title);
            break;
          }
        }
      } catch (err) {}
    }));
  }

  console.log('Lookup complete. Total images mapped:', Object.keys(imageMap).length);
  fs.writeFileSync(imageMapPath, JSON.stringify(imageMap, null, 2));
}

run();
