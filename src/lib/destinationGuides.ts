// Curated editorial content for sample-trip template pages.
//
// Provides:
//   - hero: large evocative photo (Unsplash) for the hero
//   - tagline: 2–3 sentence sensory description (replaces the comma-list copy)
//   - themes: 4–6 theme cards (title + photo + one-line description)
//
// Destinations not explicitly curated fall back to:
//   - hero: the template's existing cover_image_url
//   - tagline: the template's existing description
//   - themes: synthesized from the template's `chips` against CHIP_THEMES

const U = (id: string, w = 1600) =>
  `https://images.unsplash.com/${id}?w=${w}&q=80&auto=format&fit=crop`;

export type ThemeCard = {
  title: string;
  description: string;
  photo: string;
};

export type DestinationGuide = {
  hero: string;
  tagline: string;
  themes: ThemeCard[];
};

/* ─────────────── Generic chip fallback themes ─────────────── */

const CHIP_THEMES: Record<string, ThemeCard> = {
  Beach: {
    title: "Endless Coastlines",
    description: "Long, slow days with sand between your toes and turquoise water at your feet.",
    photo: U("photo-1507525428034-b723cf961d3e"),
  },
  Wellness: {
    title: "Wellness & Reset",
    description: "Sunrise yoga, slow breakfasts and the kind of rest you'll feel for weeks.",
    photo: U("photo-1545205597-3d9d02c29597"),
  },
  Photo: {
    title: "Photo-Worthy at Every Turn",
    description: "Light, color and scenery built for the camera roll you'll never delete.",
    photo: U("photo-1502920917128-1aa500764cbd"),
  },
  Romantic: {
    title: "Made for Two",
    description: "Candlelit dinners, secluded coves and golden-hour walks worth slowing down for.",
    photo: U("photo-1519671482749-fd09be7ccebf"),
  },
  Family: {
    title: "Something for Everyone",
    description: "Kid-friendly adventures, easy logistics and memories the whole crew will keep.",
    photo: U("photo-1502920917128-1aa500764cbd"),
  },
  City: {
    title: "City Energy",
    description: "Neighborhoods to wander, rooftops to find and a pulse you fall in step with.",
    photo: U("photo-1480714378408-67cf0d13bc1b"),
  },
  Food: {
    title: "Eat Your Way Through",
    description: "Hole-in-the-wall classics, modern tasting menus and the dish people travel for.",
    photo: U("photo-1414235077428-338989a2e8c0"),
  },
  Foodie: {
    title: "Eat Your Way Through",
    description: "Hole-in-the-wall classics, modern tasting menus and the dish people travel for.",
    photo: U("photo-1414235077428-338989a2e8c0"),
  },
  Culture: {
    title: "Culture & History",
    description: "Museums, monuments and quiet corners that explain how a place became itself.",
    photo: U("photo-1467269204594-9661b134dd2b"),
  },
  Adventure: {
    title: "Adventure Days",
    description: "Trails, water and altitude — the kind of plans that earn you the night out after.",
    photo: U("photo-1551632811-561732d1e306"),
  },
  Nature: {
    title: "Wild Nature",
    description: "Big landscapes, quiet trails and the air that makes you breathe a little deeper.",
    photo: U("photo-1469474968028-56623f02e42e"),
  },
  Luxury: {
    title: "Quietly Luxurious",
    description: "The hotels, tables and views that make it feel like a special occasion every day.",
    photo: U("photo-1582719508461-905c673771fd"),
  },
  Desert: {
    title: "Into the Desert",
    description: "Dune sunsets, starlit camps and the silence you only find this far from a city.",
    photo: U("photo-1509316785289-025f5b846b35"),
  },
  Nightlife: {
    title: "After Dark",
    description: "Rooftop bars, late dinners and the rooms where the night really starts.",
    photo: U("photo-1514525253161-7a46d19cd819"),
  },
  Mountain: {
    title: "Up in the Mountains",
    description: "Alpine air, dramatic ridgelines and lookout points worth every step up.",
    photo: U("photo-1464822759023-fed622ff2c3b"),
  },
  Island: {
    title: "Island Time",
    description: "Boats, hidden beaches and the slow rhythm only an island can teach you.",
    photo: U("photo-1505881502353-a1986add3762"),
  },
  Diving: {
    title: "Underwater Worlds",
    description: "Reefs, drop-offs and the kind of blue you only see with a mask on.",
    photo: U("photo-1583212292454-1fe6229603b7"),
  },
  Snow: {
    title: "Snow Days",
    description: "Pistes, powder and fireside après — the season at full volume.",
    photo: U("photo-1551524559-8af4e6624178"),
  },
  Safari: {
    title: "On Safari",
    description: "Open jeeps at dawn, big skies and animals on their own time.",
    photo: U("photo-1516426122078-c23e76319801"),
  },
  Spiritual: {
    title: "Sacred Places",
    description: "Temples, rituals and quiet rooms that ask you to slow down and look up.",
    photo: U("photo-1539650116574-75c0c6d73f6e"),
  },
  Architecture: {
    title: "Built to Be Seen",
    description: "Skylines, cathedrals and small details you'll only catch the second time around.",
    photo: U("photo-1486325212027-8081e485255e"),
  },
  Shopping: {
    title: "Markets & Boutiques",
    description: "Independent designers, dusty markets and the souvenir you'll actually use.",
    photo: U("photo-1481437156560-3205f6a55735"),
  },
  Coastal: {
    title: "Along the Coast",
    description: "Cliffside drives, fishing villages and lunches that take all afternoon.",
    photo: U("photo-1507525428034-b723cf961d3e"),
  },
  Hiking: {
    title: "Trails & Lookouts",
    description: "Half-day hikes that earn you a view and a long lunch afterwards.",
    photo: U("photo-1551632811-561732d1e306"),
  },
};

/* ─────────────── Curated per-destination guides ─────────────── */

export const DESTINATION_GUIDES: Record<string, DestinationGuide> = {
  "tulum-5-days": {
    hero: U("photo-1518638150340-f706e86654de"), // cenote / Tulum beach
    tagline:
      "Where ancient Mayan ruins meet the Caribbean. Days dissolve between cenotes and powder-white sand; nights find you at candlelit beach clubs under a tangle of stars.",
    themes: [
      {
        title: "Cenotes & Crystal Pools",
        description: "Dive into freshwater cenotes hidden in jungle limestone, cool and impossibly clear.",
        photo: U("photo-1518638150340-f706e86654de"),
      },
      {
        title: "Ancient Mayan Ruins",
        description: "Walk the cliffside ruins of Tulum at sunrise before the heat and the crowds arrive.",
        photo: U("photo-1568402102990-bbd4d11dee7c"),
      },
      {
        title: "Boho Beach Clubs",
        description: "Macramé hammocks, mezcal cocktails and DJ sets that drift into golden hour.",
        photo: U("photo-1507525428034-b723cf961d3e"),
      },
      {
        title: "Yucatán Cuisine",
        description: "Tacos al pastor, fresh ceviche and slow-cooked cochinita pibil from open-air kitchens.",
        photo: U("photo-1565299585323-38d6b0865b47"),
      },
      {
        title: "Wellness & Yoga",
        description: "Sunrise yoga on the sand, temazcal ceremonies and beachfront massages.",
        photo: U("photo-1545205597-3d9d02c29597"),
      },
      {
        title: "Cycling the Coast",
        description: "Pedal the long ribbon of road between jungle and sea — the best way to see Tulum.",
        photo: U("photo-1485965120184-e220f721d03e"),
      },
    ],
  },
  "tokyo-10-days": {
    hero: U("photo-1540959733332-eab4deabeeaf"),
    tagline:
      "A city of paradoxes — neon-soaked crossings and quiet shrines, vending-machine ramen and three-Michelin-star sushi. Ten days here is barely enough.",
    themes: [
      {
        title: "Neon Nights in Shibuya",
        description: "The world's busiest crossing, izakayas tucked into back-alleys and karaoke until sunrise.",
        photo: U("photo-1540959733332-eab4deabeeaf"),
      },
      {
        title: "Shrines & Quiet Gardens",
        description: "Meiji Jingu, Senso-ji and the small neighborhood shrines that hide between skyscrapers.",
        photo: U("photo-1545569341-9eb8b30979d9"),
      },
      {
        title: "The Best Food on Earth",
        description: "Counter sushi, hand-pulled ramen, conveyor-belt curiosities and convenience-store classics.",
        photo: U("photo-1535007813616-79dc02ba4021"),
      },
      {
        title: "Harajuku & Style",
        description: "Vintage boutiques, cult sneaker drops and the most-photographed street fashion in the world.",
        photo: U("photo-1542931287-023b922fa89b"),
      },
      {
        title: "Day Trip to Hakone",
        description: "Onsen, ryokan stays and a clear-day glimpse of Mt. Fuji from the lakeside.",
        photo: U("photo-1480796927426-f609979314bd"),
      },
      {
        title: "TeamLab & Modern Art",
        description: "Immersive digital worlds, contemporary galleries and the Mori at the top of Roppongi Hills.",
        photo: U("photo-1549693578-d683be217e58"),
      },
    ],
  },
  "lisbon-5-days": {
    hero: U("photo-1555881400-74d7acaacd8b"),
    tagline:
      "Pastel facades and trams that climb impossible hills. Days end with grilled sardines, a glass of vinho verde and fado drifting from an open window.",
    themes: [
      {
        title: "Alfama & the Old Quarter",
        description: "Cobblestone alleys, blue-tiled facades and the city's oldest fado houses.",
        photo: U("photo-1555881400-74d7acaacd8b"),
      },
      {
        title: "Pastéis & Café Culture",
        description: "Warm custard tarts straight from the oven, espresso at a marble counter.",
        photo: U("photo-1551024601-bec78aea704b"),
      },
      {
        title: "Tram 28 & Viewpoints",
        description: "The yellow tram clatters past every miradouro worth standing on at sunset.",
        photo: U("photo-1518730518541-d0843268c287"),
      },
      {
        title: "Day Trip to Sintra",
        description: "Fairytale palaces in misty hills — a day that feels like a different country.",
        photo: U("photo-1558102822-da570eb113b8"),
      },
      {
        title: "Seafood by the Tagus",
        description: "Grilled sardines, octopus rice and natural wine on tiled tavern terraces.",
        photo: U("photo-1414235077428-338989a2e8c0"),
      },
      {
        title: "Sunset on the Coast",
        description: "Cascais cliffs, Cabo da Roca and the wide Atlantic glowing pink at the end of the day.",
        photo: U("photo-1493558103817-58b2924bce98"),
      },
    ],
  },
  "bali-7-days": {
    hero: U("photo-1537996194471-e657df975ab4"),
    tagline:
      "Rice terraces glowing green at dawn, surf breaks at lunch, beach clubs at dusk. Bali holds room for adventure, ceremony and complete stillness — sometimes all in one day.",
    themes: [
      {
        title: "Ubud's Rice Terraces",
        description: "Walk the carved green steps of Tegallalang in the cool of early morning.",
        photo: U("photo-1537996194471-e657df975ab4"),
      },
      {
        title: "Temples & Ceremony",
        description: "Cliffside Uluwatu at sunset, water temples at sunrise, daily offerings on every doorstep.",
        photo: U("photo-1539650116574-75c0c6d73f6e"),
      },
      {
        title: "Canggu Beach Clubs",
        description: "Sunset cocktails at Single Fin, infinity pools and DJ sets long into the night.",
        photo: U("photo-1507525428034-b723cf961d3e"),
      },
      {
        title: "Surf & Swim",
        description: "Mellow long-boarding at Batu Bolong or barrels at Uluwatu — Bali has a wave for everyone.",
        photo: U("photo-1502933691298-84fc14542831"),
      },
      {
        title: "Wellness & Yoga",
        description: "Daily flow at the Yoga Barn, jungle spa days and breakfast bowls under thatched roofs.",
        photo: U("photo-1545205597-3d9d02c29597"),
      },
      {
        title: "Waterfalls & Volcanoes",
        description: "Sunrise hike up Mt. Batur or chase hidden waterfalls in the jungle around Munduk.",
        photo: U("photo-1531168556467-80aace0d0144"),
      },
    ],
  },
  "dubai-4-days": {
    hero: U("photo-1512453979798-5ea266f8880c"),
    tagline:
      "A skyline that looks invented and a desert that feels eternal. Dubai turns up the volume on everything — brunches, beaches, towers and the silence between dunes.",
    themes: [
      {
        title: "The Skyline",
        description: "Burj Khalifa at sunset, the Marina at night, observation decks above the clouds.",
        photo: U("photo-1512453979798-5ea266f8880c"),
      },
      {
        title: "Desert & Dunes",
        description: "4×4 dune drives, camel rides and dinner under the stars at a Bedouin camp.",
        photo: U("photo-1509316785289-025f5b846b35"),
      },
      {
        title: "Beach Clubs & Brunch",
        description: "Daybeds at Nikki Beach, free-flow brunches and infinity pools above the Gulf.",
        photo: U("photo-1582719508461-905c673771fd"),
      },
      {
        title: "Old Dubai & the Souks",
        description: "Wooden abras across the Creek, gold and spice markets, the original heart of the city.",
        photo: U("photo-1518684079-3c830dcef090"),
      },
      {
        title: "Modern Architecture",
        description: "The Museum of the Future, the Frame and a skyline that's still being drawn.",
        photo: U("photo-1518684079-3c830dcef090"),
      },
      {
        title: "Day at the Palm",
        description: "Atlantis, beach days on the Crescent and dinner with a view of the whole city.",
        photo: U("photo-1546412414-e1885259563a"),
      },
    ],
  },
  "barcelona-5-days": {
    hero: U("photo-1583422409516-2895a77efded"),
    tagline:
      "Gaudí's curves against Mediterranean blue. Tapas crawls in the Gothic Quarter, late dinners by the sea, and the kind of city that makes you stay one more day.",
    themes: [
      {
        title: "Gaudí's Barcelona",
        description: "Sagrada Familia, Park Güell and Casa Batlló — buildings that feel grown, not built.",
        photo: U("photo-1583422409516-2895a77efded"),
      },
      {
        title: "Gothic Quarter Wandering",
        description: "Narrow medieval streets, hidden plazas and the best vermouth bars in Spain.",
        photo: U("photo-1539037116277-4db20889f2d4"),
      },
      {
        title: "Tapas & Pintxos",
        description: "Standing-room-only bars, jamón ibérico and chefs slicing fresh anchovies in front of you.",
        photo: U("photo-1414235077428-338989a2e8c0"),
      },
      {
        title: "Beach & Barceloneta",
        description: "City-beach swims, paella by the water and sunset cocktails on the boardwalk.",
        photo: U("photo-1469854523086-cc02fe5d8800"),
      },
      {
        title: "Markets & Local Life",
        description: "La Boqueria at opening time, neighborhood markets and the city's best slow lunches.",
        photo: U("photo-1481437156560-3205f6a55735"),
      },
      {
        title: "Nightlife in El Born",
        description: "Cocktail dens, terrace bars and clubs that don't get going until well after midnight.",
        photo: U("photo-1514525253161-7a46d19cd819"),
      },
    ],
  },
  "mexico-7-days": {
    hero: U("photo-1568402102990-bbd4d11dee7c"),
    tagline:
      "Mayan pyramids in jungle clearings, cenotes hidden under limestone and colonial cities painted every color. A week barely scratches the surface — but what a week.",
    themes: [
      {
        title: "Ancient Ruins",
        description: "Walk Chichén Itzá, Tulum and the lesser-known temples lost in the Yucatán jungle.",
        photo: U("photo-1568402102990-bbd4d11dee7c"),
      },
      {
        title: "Cenotes & Caves",
        description: "Swim in freshwater pools beneath the jungle floor — the Mayan underworld, made for floating.",
        photo: U("photo-1518638150340-f706e86654de"),
      },
      {
        title: "Caribbean Beaches",
        description: "Powder sand, warm turquoise water and beach clubs with their feet in the sea.",
        photo: U("photo-1507525428034-b723cf961d3e"),
      },
      {
        title: "Mexican Cuisine",
        description: "Tacos al pastor, mole, cochinita pibil and the kind of mezcal you can only find here.",
        photo: U("photo-1565299585323-38d6b0865b47"),
      },
      {
        title: "Colonial Cities",
        description: "Pastel-painted streets, baroque cathedrals and rooftop bars that catch the breeze.",
        photo: U("photo-1518105779142-d975f22f1b0a"),
      },
      {
        title: "Markets & Mezcal",
        description: "Local artisan markets, mezcalerías and the slow rituals around Mexico's most-prized spirit.",
        photo: U("photo-1551024601-bec78aea704b"),
      },
    ],
  },
  "new-york-4-days": {
    hero: U("photo-1496442226666-8d4d0e62e6e9"),
    tagline:
      "The city that taught everywhere else how to be a city. Bagels at dawn, gallery hops by day, rooftop bars after dark — four days, fifty memories.",
    themes: [
      {
        title: "Iconic Skyline",
        description: "Top of the Rock at sunset, the Brooklyn Bridge at dusk, the Empire State at night.",
        photo: U("photo-1496442226666-8d4d0e62e6e9"),
      },
      {
        title: "Neighborhood by Neighborhood",
        description: "SoHo to West Village to Williamsburg — each block its own personality.",
        photo: U("photo-1543716091-a840c05249ec"),
      },
      {
        title: "World-Class Eats",
        description: "Bagels, slices, dim sum, omakase and the late-night diner you'll dream about.",
        photo: U("photo-1414235077428-338989a2e8c0"),
      },
      {
        title: "Galleries & Museums",
        description: "The Met, MoMA, the Whitney and a hundred small galleries hiding in Chelsea lofts.",
        photo: U("photo-1466442929976-97f336a657be"),
      },
      {
        title: "Central Park",
        description: "Boating in summer, ice skating in winter — the city's living room in every season.",
        photo: U("photo-1534430480872-3498386e7856"),
      },
      {
        title: "Broadway & Beyond",
        description: "A Broadway show, an off-off-Broadway gem and jazz in a basement in the Village.",
        photo: U("photo-1514525253161-7a46d19cd819"),
      },
    ],
  },
  "london-5-days": {
    hero: U("photo-1486299267070-83823f5448dd"),
    tagline:
      "Centuries layered street by street — palaces and pubs, markets and museums, all of it walkable if you wear the right shoes.",
    themes: [
      {
        title: "Royal & Historic",
        description: "Westminster, the Tower, Buckingham Palace and the small streets that still feel medieval.",
        photo: U("photo-1486299267070-83823f5448dd"),
      },
      {
        title: "World-Class Museums",
        description: "The British Museum, the V&A, the Tate — and most of them are free.",
        photo: U("photo-1466442929976-97f336a657be"),
      },
      {
        title: "Pubs & Sunday Roasts",
        description: "Wood-paneled pubs, garden beers and a Sunday roast that lasts most of the afternoon.",
        photo: U("photo-1514933651103-005eec06c04b"),
      },
      {
        title: "Markets & Eats",
        description: "Borough Market, Brick Lane, Maltby Street — London eats brilliantly, all over town.",
        photo: U("photo-1481437156560-3205f6a55735"),
      },
      {
        title: "Theatreland",
        description: "West End shows, fringe theatre and the long pre-show pint at a 300-year-old pub.",
        photo: U("photo-1514525253161-7a46d19cd819"),
      },
      {
        title: "Parks & Green Spaces",
        description: "Hyde Park, Hampstead Heath and the canal-side walks that feel miles from the city.",
        photo: U("photo-1534430480872-3498386e7856"),
      },
    ],
  },
  "bangkok-5-days": {
    hero: U("photo-1508009603885-50cf7c579365"),
    tagline:
      "A city that runs on heat, motorbikes and street food smoke. Gilded temples in the morning, rooftop bars by night — Bangkok rewards anyone who keeps up.",
    themes: [
      {
        title: "Glittering Temples",
        description: "Wat Pho, Wat Arun and the Grand Palace — gold and tilework that catches the morning sun.",
        photo: U("photo-1508009603885-50cf7c579365"),
      },
      {
        title: "Street Food Crawl",
        description: "Pad thai at midnight, mango sticky rice from a cart, boat noodles in a 50-year-old shop.",
        photo: U("photo-1559314809-0d155014e29e"),
      },
      {
        title: "Markets at Every Hour",
        description: "Chatuchak by day, Asiatique at sunset, Khao San after midnight — Bangkok never closes.",
        photo: U("photo-1481437156560-3205f6a55735"),
      },
      {
        title: "Rooftop Bars",
        description: "Cocktails 60 floors above the river — Lebua, Vertigo, the unnamed ones the locals love.",
        photo: U("photo-1582719508461-905c673771fd"),
      },
      {
        title: "Klongs & River Life",
        description: "Long-tail boats through the canals, sunset on the Chao Phraya and floating markets at dawn.",
        photo: U("photo-1493020258366-be3ead61c4e0"),
      },
      {
        title: "Day Trip to Ayutthaya",
        description: "The ruined royal capital — temples reclaimed by jungle, a 90-minute train ride away.",
        photo: U("photo-1539650116574-75c0c6d73f6e"),
      },
    ],
  },
};

/* ─────────────── Public helpers ─────────────── */

export function getDestinationGuide(
  slug: string | undefined,
  fallbacks: { hero: string | null; tagline: string | null; chips: string[] | null },
): DestinationGuide {
  const curated = slug ? DESTINATION_GUIDES[slug] : undefined;
  if (curated) return curated;

  // Synthesize from chips
  const chips = fallbacks.chips ?? [];
  const themes: ThemeCard[] = [];
  const seen = new Set<string>();
  for (const chip of chips) {
    const t = CHIP_THEMES[chip];
    if (t && !seen.has(t.title)) {
      themes.push(t);
      seen.add(t.title);
    }
  }
  // Pad to at least 4 themes if chip-mapping was thin
  for (const fallbackChip of ["City", "Food", "Culture", "Nature"]) {
    if (themes.length >= 4) break;
    const t = CHIP_THEMES[fallbackChip];
    if (t && !seen.has(t.title)) {
      themes.push(t);
      seen.add(t.title);
    }
  }

  return {
    hero: fallbacks.hero ?? U("photo-1488646953014-85cb44e25828"),
    tagline:
      fallbacks.tagline ??
      "A trip built around what you actually want — your dates, your pace, your group.",
    themes,
  };
}
