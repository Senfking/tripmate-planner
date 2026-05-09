// Curate Unsplash photos for the 10 DESTINATION_GUIDES with full metadata.
// Strategy: for each destination, do 1 hero search + N theme searches.
// Throttle to ~1 req/sec; pause 60s on 403 (rate limit).

const KEY = "QGdV_dIU9xb6HUkaO5_quk-YNC99y9TL4xnj4NwZmJA";

const PLAN = {
  "tulum-5-days": {
    hero: "tulum beach cenote sunrise",
    tagline:
      "Where ancient Mayan ruins meet the Caribbean. Days dissolve between cenotes and powder-white sand; nights find you at candlelit beach clubs under a tangle of stars.",
    themes: [
      { title: "Cenotes & Crystal Pools", description: "Dive into freshwater cenotes hidden in jungle limestone, cool and impossibly clear.", query: "cenote mexico jungle" },
      { title: "Ancient Mayan Ruins", description: "Walk the cliffside ruins of Tulum at sunrise before the heat and the crowds arrive.", query: "tulum ruins mayan" },
      { title: "Boho Beach Clubs", description: "Macramé hammocks, mezcal cocktails and DJ sets that drift into golden hour.", query: "tulum beach club hammock" },
      { title: "Yucatán Cuisine", description: "Tacos al pastor, fresh ceviche and slow-cooked cochinita pibil from open-air kitchens.", query: "tacos al pastor mexico" },
      { title: "Wellness & Yoga", description: "Sunrise yoga on the sand, temazcal ceremonies and beachfront massages.", query: "beach yoga sunrise tulum" },
      { title: "Cycling the Coast", description: "Pedal the long ribbon of road between jungle and sea — the best way to see Tulum.", query: "bicycle jungle road tulum" },
    ],
  },
  "tokyo-10-days": {
    hero: "tokyo shibuya neon night",
    tagline: "A city of paradoxes — neon-soaked crossings and quiet shrines, vending-machine ramen and three-Michelin-star sushi. Ten days here is barely enough.",
    themes: [
      { title: "Neon Nights in Shibuya", description: "The world's busiest crossing, izakayas tucked into back-alleys and karaoke until sunrise.", query: "shibuya crossing night neon" },
      { title: "Shrines & Quiet Gardens", description: "Meiji Jingu, Senso-ji and the small neighborhood shrines that hide between skyscrapers.", query: "tokyo shrine senso-ji" },
      { title: "The Best Food on Earth", description: "Counter sushi, hand-pulled ramen, conveyor-belt curiosities and convenience-store classics.", query: "tokyo ramen counter" },
      { title: "Harajuku & Style", description: "Vintage boutiques, cult sneaker drops and the most-photographed street fashion in the world.", query: "harajuku street fashion tokyo" },
      { title: "Day Trip to Hakone", description: "Onsen, ryokan stays and a clear-day glimpse of Mt. Fuji from the lakeside.", query: "mount fuji hakone lake" },
      { title: "TeamLab & Modern Art", description: "Immersive digital worlds, contemporary galleries and the Mori at the top of Roppongi Hills.", query: "teamlab tokyo immersive" },
    ],
  },
  "lisbon-5-days": {
    hero: "lisbon tram alfama yellow",
    tagline: "Pastel facades and trams that climb impossible hills. Days end with grilled sardines, a glass of vinho verde and fado drifting from an open window.",
    themes: [
      { title: "Alfama & the Old Quarter", description: "Cobblestone alleys, blue-tiled facades and the city's oldest fado houses.", query: "alfama lisbon street tile" },
      { title: "Pastéis & Café Culture", description: "Warm custard tarts straight from the oven, espresso at a marble counter.", query: "pastel de nata lisbon" },
      { title: "Tram 28 & Viewpoints", description: "The yellow tram clatters past every miradouro worth standing on at sunset.", query: "lisbon tram 28 yellow" },
      { title: "Day Trip to Sintra", description: "Fairytale palaces in misty hills — a day that feels like a different country.", query: "sintra pena palace portugal" },
      { title: "Seafood by the Tagus", description: "Grilled sardines, octopus rice and natural wine on tiled tavern terraces.", query: "grilled sardines portugal" },
      { title: "Sunset on the Coast", description: "Cascais cliffs, Cabo da Roca and the wide Atlantic glowing pink at the end of the day.", query: "cascais cliffs sunset portugal" },
    ],
  },
  "bali-7-days": {
    hero: "bali rice terrace ubud",
    tagline: "Rice terraces glowing green at dawn, surf breaks at lunch, beach clubs at dusk. Bali holds room for adventure, ceremony and complete stillness — sometimes all in one day.",
    themes: [
      { title: "Ubud's Rice Terraces", description: "Walk the carved green steps of Tegallalang in the cool of early morning.", query: "tegallalang rice terrace ubud" },
      { title: "Temples & Ceremony", description: "Cliffside Uluwatu at sunset, water temples at sunrise, daily offerings on every doorstep.", query: "uluwatu temple bali sunset" },
      { title: "Canggu Beach Clubs", description: "Sunset cocktails at Single Fin, infinity pools and DJ sets long into the night.", query: "canggu beach club bali" },
      { title: "Surf & Swim", description: "Mellow long-boarding at Batu Bolong or barrels at Uluwatu — Bali has a wave for everyone.", query: "bali surfer uluwatu" },
      { title: "Wellness & Yoga", description: "Daily flow at the Yoga Barn, jungle spa days and breakfast bowls under thatched roofs.", query: "bali yoga jungle ubud" },
      { title: "Waterfalls & Volcanoes", description: "Sunrise hike up Mt. Batur or chase hidden waterfalls in the jungle around Munduk.", query: "bali waterfall jungle munduk" },
    ],
  },
  "dubai-4-days": {
    hero: "dubai skyline burj khalifa",
    tagline: "A skyline that looks invented and a desert that feels eternal. Dubai turns up the volume on everything — brunches, beaches, towers and the silence between dunes.",
    themes: [
      { title: "The Skyline", description: "Burj Khalifa at sunset, the Marina at night, observation decks above the clouds.", query: "burj khalifa dubai sunset" },
      { title: "Desert & Dunes", description: "4×4 dune drives, camel rides and dinner under the stars at a Bedouin camp.", query: "dubai desert dunes camel" },
      { title: "Beach Clubs & Brunch", description: "Daybeds at Nikki Beach, free-flow brunches and infinity pools above the Gulf.", query: "dubai infinity pool gulf" },
      { title: "Old Dubai & the Souks", description: "Wooden abras across the Creek, gold and spice markets, the original heart of the city.", query: "dubai gold spice souk" },
      { title: "Modern Architecture", description: "The Museum of the Future, the Frame and a skyline that's still being drawn.", query: "museum of the future dubai" },
      { title: "Day at the Palm", description: "Atlantis, beach days on the Crescent and dinner with a view of the whole city.", query: "palm jumeirah dubai aerial" },
    ],
  },
  "barcelona-5-days": {
    hero: "barcelona sagrada familia gaudi",
    tagline: "Gaudí's curves against Mediterranean blue. Tapas crawls in the Gothic Quarter, late dinners by the sea, and the kind of city that makes you stay one more day.",
    themes: [
      { title: "Gaudí's Barcelona", description: "Sagrada Familia, Park Güell and Casa Batlló — buildings that feel grown, not built.", query: "park guell barcelona gaudi" },
      { title: "Gothic Quarter Wandering", description: "Narrow medieval streets, hidden plazas and the best vermouth bars in Spain.", query: "barri gotic barcelona alley" },
      { title: "Tapas & Pintxos", description: "Standing-room-only bars, jamón ibérico and chefs slicing fresh anchovies in front of you.", query: "tapas spain jamon" },
      { title: "Beach & Barceloneta", description: "City-beach swims, paella by the water and sunset cocktails on the boardwalk.", query: "barceloneta beach barcelona" },
      { title: "Markets & Local Life", description: "La Boqueria at opening time, neighborhood markets and the city's best slow lunches.", query: "la boqueria market barcelona" },
      { title: "Nightlife in El Born", description: "Cocktail dens, terrace bars and clubs that don't get going until well after midnight.", query: "barcelona cocktail bar night" },
    ],
  },
  "mexico-7-days": {
    hero: "mexico chichen itza pyramid",
    tagline: "Mayan pyramids in jungle clearings, cenotes hidden under limestone and colonial cities painted every color. A week barely scratches the surface — but what a week.",
    themes: [
      { title: "Ancient Ruins", description: "Walk Chichén Itzá, Tulum and the lesser-known temples lost in the Yucatán jungle.", query: "chichen itza pyramid mexico" },
      { title: "Cenotes & Caves", description: "Swim in freshwater pools beneath the jungle floor — the Mayan underworld, made for floating.", query: "cenote yucatan cave swim" },
      { title: "Caribbean Beaches", description: "Powder sand, warm turquoise water and beach clubs with their feet in the sea.", query: "yucatan caribbean beach turquoise" },
      { title: "Mexican Cuisine", description: "Tacos al pastor, mole, cochinita pibil and the kind of mezcal you can only find here.", query: "mexican tacos street food" },
      { title: "Colonial Cities", description: "Pastel-painted streets, baroque cathedrals and rooftop bars that catch the breeze.", query: "guanajuato colonial mexico colorful" },
      { title: "Markets & Mezcal", description: "Local artisan markets, mezcalerías and the slow rituals around Mexico's most-prized spirit.", query: "mezcal mexico bar" },
    ],
  },
  "new-york-4-days": {
    hero: "new york skyline manhattan",
    tagline: "The city that taught everywhere else how to be a city. Bagels at dawn, gallery hops by day, rooftop bars after dark — four days, fifty memories.",
    themes: [
      { title: "Iconic Skyline", description: "Top of the Rock at sunset, the Brooklyn Bridge at dusk, the Empire State at night.", query: "manhattan skyline empire state" },
      { title: "Neighborhood by Neighborhood", description: "SoHo to West Village to Williamsburg — each block its own personality.", query: "soho new york street" },
      { title: "World-Class Eats", description: "Bagels, slices, dim sum, omakase and the late-night diner you'll dream about.", query: "new york pizza slice" },
      { title: "Galleries & Museums", description: "The Met, MoMA, the Whitney and a hundred small galleries hiding in Chelsea lofts.", query: "metropolitan museum new york" },
      { title: "Central Park", description: "Boating in summer, ice skating in winter — the city's living room in every season.", query: "central park new york autumn" },
      { title: "Broadway & Beyond", description: "A Broadway show, an off-off-Broadway gem and jazz in a basement in the Village.", query: "broadway theater times square" },
    ],
  },
  "london-5-days": {
    hero: "london big ben westminster",
    tagline: "Centuries layered street by street — palaces and pubs, markets and museums, all of it walkable if you wear the right shoes.",
    themes: [
      { title: "Royal & Historic", description: "Westminster, the Tower, Buckingham Palace and the small streets that still feel medieval.", query: "tower of london bridge" },
      { title: "World-Class Museums", description: "The British Museum, the V&A, the Tate — and most of them are free.", query: "british museum london interior" },
      { title: "Pubs & Sunday Roasts", description: "Wood-paneled pubs, garden beers and a Sunday roast that lasts most of the afternoon.", query: "london pub interior wood" },
      { title: "Markets & Eats", description: "Borough Market, Brick Lane, Maltby Street — London eats brilliantly, all over town.", query: "borough market london food" },
      { title: "Theatreland", description: "West End shows, fringe theatre and the long pre-show pint at a 300-year-old pub.", query: "west end london theatre night" },
      { title: "Parks & Green Spaces", description: "Hyde Park, Hampstead Heath and the canal-side walks that feel miles from the city.", query: "hyde park london autumn" },
    ],
  },
  "bangkok-5-days": {
    hero: "bangkok wat arun temple",
    tagline: "A city that runs on heat, motorbikes and street food smoke. Gilded temples in the morning, rooftop bars by night — Bangkok rewards anyone who keeps up.",
    themes: [
      { title: "Glittering Temples", description: "Wat Pho, Wat Arun and the Grand Palace — gold and tilework that catches the morning sun.", query: "wat arun bangkok temple" },
      { title: "Street Food Crawl", description: "Pad thai at midnight, mango sticky rice from a cart, boat noodles in a 50-year-old shop.", query: "bangkok street food night" },
      { title: "Markets at Every Hour", description: "Chatuchak by day, Asiatique at sunset, Khao San after midnight — Bangkok never closes.", query: "chatuchak market bangkok" },
      { title: "Rooftop Bars", description: "Cocktails 60 floors above the river — Lebua, Vertigo, the unnamed ones the locals love.", query: "bangkok rooftop bar skyline" },
      { title: "Klongs & River Life", description: "Long-tail boats through the canals, sunset on the Chao Phraya and floating markets at dawn.", query: "long tail boat bangkok river" },
      { title: "Day Trip to Ayutthaya", description: "The ruined royal capital — temples reclaimed by jungle, a 90-minute train ride away.", query: "ayutthaya thailand ruins" },
    ],
  },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function searchOne(query, attempt = 0) {
  const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=5&orientation=landscape&content_filter=high`;
  const res = await fetch(url, { headers: { Authorization: `Client-ID ${KEY}` } });
  if (res.status === 403 && attempt < 3) {
    console.error(`Rate limited on "${query}". Sleeping 65s...`);
    await sleep(65000);
    return searchOne(query, attempt + 1);
  }
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`HTTP ${res.status} for "${query}": ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.results || [];
}

// Try query, then progressively shorter fallbacks (drop trailing words).
async function search(query) {
  const words = query.split(/\s+/);
  for (let i = words.length; i >= 1; i--) {
    const q = words.slice(0, i).join(" ");
    const results = await searchOne(q);
    await sleep(1100);
    if (results.length > 0) {
      const p = results[0];
      return {
        url: p.urls.regular,
        photoId: p.id,
        photographerName: p.user.name,
        photographerUrl: `${p.user.links.html}?utm_source=junto&utm_medium=referral`,
        downloadLocation: p.links.download_location,
        _matchedQuery: q,
      };
    }
    console.error(`    (no results for "${q}", trying shorter)`);
  }
  throw new Error(`No results for any prefix of "${query}"`);
}
// (search() handles result extraction inline above)

import { readFileSync, writeFileSync, existsSync } from "node:fs";
const OUT_PATH = "/tmp/curated.json";

const out = existsSync(OUT_PATH)
  ? JSON.parse(readFileSync(OUT_PATH, "utf8"))
  : {};
const save = () => writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));

let calls = 0;
try {
  for (const [slug, plan] of Object.entries(PLAN)) {
    if (out[slug]) {
      console.error(`\n=== ${slug} (already done, skip) ===`);
      continue;
    }
    console.error(`\n=== ${slug} ===`);
    const heroPhoto = await search(plan.hero);
    calls++;
    const themes = [];
    for (const t of plan.themes) {
      const photo = await search(t.query);
      calls++;
      themes.push({ title: t.title, description: t.description, photo });
      console.error(`  ✓ ${t.title} → ${photo.photoId} by ${photo.photographerName} (q="${photo._matchedQuery}")`);
    }
    out[slug] = { hero: heroPhoto, tagline: plan.tagline, themes };
    save();
    console.error(`  hero → ${heroPhoto.photoId} by ${heroPhoto.photographerName} (q="${heroPhoto._matchedQuery}") [SAVED]`);
  }
} catch (e) {
  save();
  console.error(`\n!!! Stopped after ${calls} calls this run: ${e.message}`);
  console.error(`Progress saved to ${OUT_PATH}. Re-run later to resume.`);
  process.exit(2);
}

console.error(`\nTotal calls: ${calls}`);
console.log(JSON.stringify(out, null, 2));
