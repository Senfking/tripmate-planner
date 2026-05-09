// Curated editorial content for sample-trip template pages.
//
// Provides:
//   - hero: large evocative photo (Unsplash) for the hero
//   - tagline: 2–3 sentence sensory description
//   - themes: 4–6 theme cards (title + photo + one-line description)
//
// Photos can be either a plain hotlink string (legacy / quick fallbacks)
// or a full UnsplashPhotoMeta object with photographer attribution. The
// rendering side normalizes via `resolvePhoto()` and shows attribution
// whenever metadata is present.
//
// Destinations not explicitly curated fall back to:
//   - hero: the template's existing cover_image_url
//   - tagline: the template's existing description
//   - themes: synthesized from the template's `chips` against
//     CHIP_THEMES_BY_REGION (region-specific) → CHIP_THEMES (generic).

import type { UnsplashPhotoMeta } from "./unsplashAttribution";

const U = (id: string, w = 1600) =>
  `https://images.unsplash.com/${id}?w=${w}&q=80&auto=format&fit=crop`;

export type ThemePhoto = string | UnsplashPhotoMeta;

export type ThemeCard = {
  title: string;
  description: string;
  photo: ThemePhoto;
};

export type DestinationGuide = {
  hero: ThemePhoto;
  tagline: string;
  /** Long-form description (3-4 paragraphs separated by \n\n) used for SEO + future About section. */
  longForm?: string;
  themes: ThemeCard[];
};

/** Resolve a ThemePhoto to a render-ready { url, meta? } pair. */
export function resolvePhoto(p: ThemePhoto): {
  url: string;
  meta: UnsplashPhotoMeta | null;
} {
  if (typeof p === "string") return { url: p, meta: null };
  return { url: p.url, meta: p };
}

/* ─────────────── Region inference ─────────────── */

export type Region =
  | "caribbean"
  | "mediterranean"
  | "indian_ocean"
  | "pacific"
  | "se_asia"
  | "east_asia"
  | "south_asia"
  | "middle_east"
  | "north_africa"
  | "sub_saharan_africa"
  | "western_europe"
  | "northern_europe"
  | "eastern_europe"
  | "iberia"
  | "north_america"
  | "central_america"
  | "south_america"
  | "oceania";

const COUNTRY_TO_REGION: Record<string, Region> = {
  // Caribbean
  CU: "caribbean", JM: "caribbean", DO: "caribbean", BS: "caribbean", BB: "caribbean",
  // Central America (incl. Mexico's Caribbean coast destinations like Tulum/Yucatán)
  MX: "central_america", CR: "central_america", PA: "central_america", GT: "central_america", BZ: "central_america", NI: "central_america",
  // South America
  PE: "south_america", CO: "south_america", BR: "south_america", AR: "south_america", CL: "south_america", EC: "south_america",
  // North America
  US: "north_america", CA: "north_america",
  // Iberia
  ES: "iberia", PT: "iberia",
  // Mediterranean
  GR: "mediterranean", IT: "mediterranean", HR: "mediterranean", TR: "mediterranean",
  // Western Europe
  FR: "western_europe", DE: "western_europe", NL: "western_europe", GB: "western_europe", BE: "western_europe", CH: "western_europe", AT: "western_europe", IE: "western_europe",
  // Northern Europe
  IS: "northern_europe", NO: "northern_europe", SE: "northern_europe", DK: "northern_europe", FI: "northern_europe",
  // Eastern Europe
  CZ: "eastern_europe", PL: "eastern_europe", HU: "eastern_europe", RO: "eastern_europe",
  // Middle East
  AE: "middle_east", JO: "middle_east", SA: "middle_east", IL: "middle_east", QA: "middle_east", OM: "middle_east", LB: "middle_east",
  // North Africa
  EG: "north_africa", MA: "north_africa", TN: "north_africa",
  // Sub-Saharan Africa
  ZA: "sub_saharan_africa", KE: "sub_saharan_africa", TZ: "sub_saharan_africa", NA: "sub_saharan_africa", BW: "sub_saharan_africa",
  // Indian Ocean
  MV: "indian_ocean", SC: "indian_ocean", MU: "indian_ocean",
  // Pacific
  PF: "pacific", FJ: "pacific", WS: "pacific", TO: "pacific",
  // SE Asia
  TH: "se_asia", ID: "se_asia", VN: "se_asia", SG: "se_asia", MY: "se_asia", PH: "se_asia", KH: "se_asia", LA: "se_asia",
  // East Asia
  JP: "east_asia", KR: "east_asia", CN: "east_asia", TW: "east_asia", HK: "east_asia",
  // South Asia
  IN: "south_asia", NP: "south_asia", LK: "south_asia", BT: "south_asia",
  // Oceania
  AU: "oceania", NZ: "oceania",
};

export function regionForCountry(iso: string | null | undefined): Region | null {
  if (!iso) return null;
  return COUNTRY_TO_REGION[iso.toUpperCase()] ?? null;
}

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
  History: {
    title: "Layers of History",
    description: "Centuries told through stones, streets and the people who still live among them.",
    photo: U("photo-1467269204594-9661b134dd2b"),
  },
  Adventure: {
    title: "Adventure Days",
    description: "Trails, water and altitude, the kind of plans that earn you the night out after.",
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
  Mountains: {
    title: "Up in the Mountains",
    description: "Alpine air, dramatic ridgelines and lookout points worth every step up.",
    photo: U("photo-1464822759023-fed622ff2c3b"),
  },
  Hiking: {
    title: "Trails & Lookouts",
    description: "Half-day hikes that earn you a view and a long lunch afterwards.",
    photo: U("photo-1551632811-561732d1e306"),
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
  Snorkel: {
    title: "Reef & Snorkel",
    description: "Warm shallows, parrotfish and the easy magic of putting your face in the water.",
    photo: U("photo-1583212292454-1fe6229603b7"),
  },
  Snow: {
    title: "Snow Days",
    description: "Pistes, powder and fireside après, the season at full volume.",
    photo: U("photo-1551524559-8af4e6624178"),
  },
  Safari: {
    title: "On Safari",
    description: "Open jeeps at dawn, big skies and animals on their own time.",
    photo: U("photo-1516426122078-c23e76319801"),
  },
  Wildlife: {
    title: "Up Close with Wildlife",
    description: "Open jeeps at dawn, quiet hides and animals on their own time.",
    photo: U("photo-1516426122078-c23e76319801"),
  },
  Spiritual: {
    title: "Sacred Places",
    description: "Temples, rituals and quiet rooms that ask you to slow down and look up.",
    photo: U("photo-1539650116574-75c0c6d73f6e"),
  },
  Temples: {
    title: "Glittering Temples",
    description: "Gold leaf, incense and quiet courtyards to step into between busy streets.",
    photo: U("photo-1545569341-9eb8b30979d9"),
  },
  Architecture: {
    title: "Built to Be Seen",
    description: "Skylines, cathedrals and small details you'll only catch the second time around.",
    photo: U("photo-1486325212027-8081e485255e"),
  },
  Modern: {
    title: "Built for Tomorrow",
    description: "Sleek skylines, future-facing architecture and design that feels years ahead.",
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
  Coast: {
    title: "Along the Coast",
    description: "Cliffside drives, fishing villages and lunches that take all afternoon.",
    photo: U("photo-1507525428034-b723cf961d3e"),
  },
  Sailing: {
    title: "Out on the Water",
    description: "Charter days, swim stops in hidden coves and lunches on deck.",
    photo: U("photo-1473186578172-c141e6798cf4"),
  },
  Bike: {
    title: "On Two Wheels",
    description: "Pedal between cafés and canals, the easiest way to see a city like a local.",
    photo: U("photo-1485965120184-e220f721d03e"),
  },
  Party: {
    title: "Until Sunrise",
    description: "Open-air clubs, white-island sets and dancefloors that don't quit before dawn.",
    photo: U("photo-1514525253161-7a46d19cd819"),
  },
  Hidden: {
    title: "Off the Tourist Map",
    description: "Quiet neighborhoods, working-class bars and the corners visitors usually miss.",
    photo: U("photo-1543716091-a840c05249ec"),
  },
  Budget: {
    title: "Travels Light on the Wallet",
    description: "Hostels, street food and the kind of trip you can afford to make twice.",
    photo: U("photo-1481437156560-3205f6a55735"),
  },
  Overwater: {
    title: "Overwater Bungalows",
    description: "Wake to lagoon water under the floor and a horizon that's all yours.",
    photo: U("photo-1573843981267-be1999ff37cd"),
  },
};

/* ─────────────── Region-specific variants ─────────────── */
// Same `title` keys as CHIP_THEMES, but with photos that match the
// continent / climate so a "Beach" card in Greece doesn't look like
// a "Beach" card in the Maldives.

const CHIP_THEMES_BY_REGION: Partial<
  Record<string, Partial<Record<Region, ThemeCard>>>
> = {
  Beach: {
    caribbean:    { title: "Caribbean Shores",      description: "Powder-white sand, neon-turquoise water and slow days that disappear into rum at sunset.", photo: U("photo-1583852741284-aef74ee3eb18") },
    central_america: { title: "Caribbean Shores",   description: "Powder-white sand, neon-turquoise water and beach clubs with their feet in the sea.", photo: U("photo-1518638150340-f706e86654de") },
    mediterranean:{ title: "Mediterranean Coves",   description: "Cliff-cradled bays, terracotta villages and lunches of grilled fish above the blue.", photo: U("photo-1601581875309-fafbf2d3ed3a") },
    iberia:       { title: "Mediterranean Coves",   description: "Sun-bleached cliffs, hidden calas and beach restaurants you reach by boat.", photo: U("photo-1469854523086-cc02fe5d8800") },
    indian_ocean: { title: "Indian Ocean Reefs",    description: "Glass-clear lagoons, coral drop-offs and overwater bungalows on stilts.", photo: U("photo-1573843981267-be1999ff37cd") },
    pacific:      { title: "South Pacific Lagoons", description: "Volcanic islands, palm-fringed motus and water in a hundred shades of blue.", photo: U("photo-1573843981267-be1999ff37cd") },
    se_asia:      { title: "Tropical Beaches",      description: "Long-tail boats, limestone cliffs rising from warm water and beach bars on the sand.", photo: U("photo-1537956965359-7573183d1f57") },
    sub_saharan_africa: { title: "Indian Ocean Beaches", description: "Spice islands, dhow boats at sunset and miles of empty white sand.", photo: U("photo-1571406761758-9a3eed5338ef") },
  },
  City: {
    western_europe: { title: "European Capital",   description: "Grand boulevards, neighborhood cafés and museums you could easily lose a day inside.", photo: U("photo-1502602898657-3e91760cbb34") },
    eastern_europe: { title: "Old World Streets",  description: "Cobblestones, gothic spires and beer halls that have been pouring for 400 years.", photo: U("photo-1519677100203-a0e668c92439") },
    iberia:        { title: "Sunlit Plazas",        description: "Tiled facades, tapas counters and squares where the city comes out at dusk.", photo: U("photo-1539037116277-4db20889f2d4") },
    east_asia:     { title: "Neon Megacity",        description: "Crossings, vending machines, ramen counters and skylines that feel cinematic.", photo: U("photo-1540959733332-eab4deabeeaf") },
    se_asia:       { title: "Tropical Metropolis",  description: "Tuk-tuks, street food smoke, gilded temples and rooftop bars in the heat.", photo: U("photo-1508009603885-50cf7c579365") },
    middle_east:   { title: "Skyline & Souk",       description: "Glass towers, gold markets and the call to prayer drifting over rooftop pools.", photo: U("photo-1512453979798-5ea266f8880c") },
    north_america: { title: "Big City Energy",      description: "Brownstones, bagels, gallery hops and rooftop bars that earn the cliché.", photo: U("photo-1496442226666-8d4d0e62e6e9") },
    south_america: { title: "Latin Capital",        description: "Colonial plazas, late dinners and a pulse that picks up after midnight.", photo: U("photo-1518105779142-d975f22f1b0a") },
  },
  Food: {
    se_asia:       { title: "Street Food Heaven",   description: "Pad thai at midnight, mango sticky rice from a cart, and the smoke of a hundred grills.", photo: U("photo-1559314809-0d155014e29e") },
    east_asia:     { title: "From Counter to Counter", description: "Sushi at a 6-seat bar, hand-pulled ramen, dim sum carts and convenience-store classics.", photo: U("photo-1535007813616-79dc02ba4021") },
    mediterranean: { title: "Mediterranean Table",  description: "Olive oil, grilled fish, wine by the carafe and tomatoes that taste like summer.", photo: U("photo-1540189549336-e6e99c3679fe") },
    iberia:        { title: "Tapas & Pintxos",      description: "Standing-room-only bars, jamón ibérico, anchovies and vermouth on a hot afternoon.", photo: U("photo-1540189549336-e6e99c3679fe") },
    central_america: { title: "Tacos & Mezcal",     description: "Al pastor on the trompo, fresh ceviche and the kind of mezcal you only find here.", photo: U("photo-1565299585323-38d6b0865b47") },
    middle_east:   { title: "Mezze & Grills",       description: "Hummus, fresh flatbread, charcoal grills and sweet cardamom coffee after.", photo: U("photo-1540189549336-e6e99c3679fe") },
    south_asia:    { title: "Spice & Smoke",        description: "Tandoors, thalis, chai stops and the kind of spice that earns its name.", photo: U("photo-1565557623262-b51c2513a641") },
    north_africa:  { title: "Tagines & Mint Tea",   description: "Slow-cooked lamb, market spices and afternoon tea poured from a height.", photo: U("photo-1565557623262-b51c2513a641") },
  },
  Culture: {
    east_asia:     { title: "Shrines & Tradition",  description: "Tea ceremonies, calligraphy and shrines tucked between glass towers.", photo: U("photo-1545569341-9eb8b30979d9") },
    south_asia:    { title: "Color & Ceremony",     description: "Festivals, painted temples and the rituals woven into everyday life.", photo: U("photo-1539650116574-75c0c6d73f6e") },
    middle_east:   { title: "Old Quarters & Bazaars", description: "Caravanserai, spice markets and mosques whose tilework you'll photograph for hours.", photo: U("photo-1518684079-3c830dcef090") },
    mediterranean: { title: "Ancient & Alive",      description: "Ruins next to bakeries, amphitheatres still hosting concerts and 3,000-year-old streets.", photo: U("photo-1555993539-1732b0258235") },
    south_america: { title: "Pre-Columbian Roots",  description: "Stone citadels, weavers, Andean markets and music that's older than the Conquest.", photo: U("photo-1526392060635-9d6019884377") },
  },
  Nature: {
    northern_europe: { title: "Glaciers & Geysers", description: "Black sand, waterfalls, fjords and the kind of empty horizon that feels healing.", photo: U("photo-1500530855697-b586d89ba3ee") },
    sub_saharan_africa: { title: "Big Skies, Big Game", description: "Acacia silhouettes at sunset, savannah and animals on their own time.", photo: U("photo-1516426122078-c23e76319801") },
    central_america: { title: "Cloud Forest & Coast", description: "Volcanoes, monkeys, hot springs and rivers that disappear into jungle.", photo: U("photo-1518562923054-9a8f74917d61") },
    south_america: { title: "Andes & Amazon",       description: "Glacier-blue lakes, jungle rivers and lookout points 4,000m up.", photo: U("photo-1526392060635-9d6019884377") },
    se_asia:        { title: "Jungle & Karst",      description: "Limestone islands, hidden waterfalls and rice terraces glowing green at dawn.", photo: U("photo-1531168556467-80aace0d0144") },
    western_europe: { title: "Alps & Lakes",        description: "Storybook lakes, hiking trails and villages that feel painted into the mountain.", photo: U("photo-1464822759023-fed622ff2c3b") },
  },
  Adventure: {
    south_america: { title: "Big Adventures",       description: "Inca trails, Amazon rivers, dunes and altitude, earned days, hard-slept nights.", photo: U("photo-1526392060635-9d6019884377") },
    central_america: { title: "Rainforest & Surf",  description: "Surf breaks, zip-lines, river floats and waterfalls you can swim under.", photo: U("photo-1518562923054-9a8f74917d61") },
    south_asia:    { title: "High Himalaya",        description: "Trek days that turn into stories, passes, prayer flags and cups of butter tea.", photo: U("photo-1464822759023-fed622ff2c3b") },
    sub_saharan_africa: { title: "Bush & Beyond",   description: "Walking safaris, dune driving and rivers full of more than just water.", photo: U("photo-1516426122078-c23e76319801") },
    se_asia:       { title: "Jungle Days",          description: "Cave systems, waterfalls and motorbike rides between rice paddies.", photo: U("photo-1531168556467-80aace0d0144") },
  },
  Mountain: {
    western_europe:  { title: "Alpine Days",        description: "Cable cars, panoramic ridgelines and rösti at the top of the chair.", photo: U("photo-1464822759023-fed622ff2c3b") },
    south_asia:      { title: "High Himalaya",      description: "Mountain villages, prayer flags and views that stop you mid-step.", photo: U("photo-1464822759023-fed622ff2c3b") },
    south_america:   { title: "The Andes",          description: "Glacier valleys, switchback trails and condors riding the thermals.", photo: U("photo-1526392060635-9d6019884377") },
  },
  Desert: {
    middle_east:   { title: "Arabian Sands",        description: "4×4 dune drives, camel sunsets and dinner under stars at a Bedouin camp.", photo: U("photo-1509316785289-025f5b846b35") },
    north_africa:  { title: "Sahara Nights",        description: "Long camel trains, drum circles in the dunes and a sky thick with stars.", photo: U("photo-1531253450048-d6c9b4138a87") },
  },
  History: {
    mediterranean: { title: "Ancient World",        description: "Ruins, citadels and amphitheatres still hosting concerts after 2,000 years.", photo: U("photo-1555993539-1732b0258235") },
    middle_east:   { title: "Lost Cities",          description: "Petra at dawn, desert citadels and trade routes carved straight into the rock.", photo: U("photo-1539037116277-4db20889f2d4") },
    eastern_europe:{ title: "Old Europe",           description: "Castles on hills, baroque squares and stories from every century.", photo: U("photo-1519677100203-a0e668c92439") },
    south_asia:    { title: "Empires & Forts",      description: "Mughal forts, palace cities and stepwells carved deep into the earth.", photo: U("photo-1539650116574-75c0c6d73f6e") },
    north_africa:  { title: "Pharaohs & Caravans",  description: "Pyramids at dawn, temple complexes and desert routes still walked today.", photo: U("photo-1539037116277-4db20889f2d4") },
  },
  Nightlife: {
    iberia:        { title: "Until Sunrise",        description: "Open-air clubs, white-island sets and a night that doesn't quit before dawn.", photo: U("photo-1514525253161-7a46d19cd819") },
    se_asia:       { title: "Rooftops & Beach Bars", description: "Cocktails 60 floors up, beachfront DJ sets and night markets that hum till 4am.", photo: U("photo-1582719508461-905c673771fd") },
    western_europe:{ title: "Bars & Late Nights",   description: "Speakeasies, jazz cellars and corner pubs that empty into the street at last call.", photo: U("photo-1514525253161-7a46d19cd819") },
  },
  Romantic: {
    mediterranean: { title: "Made for Two",         description: "Cliffside dinners, Aperol at sunset and walks through villages painted pink at dusk.", photo: U("photo-1601581875309-fafbf2d3ed3a") },
    indian_ocean:  { title: "Honeymoon Quiet",      description: "Just the two of you, an overwater deck and a horizon doing all the work.", photo: U("photo-1573843981267-be1999ff37cd") },
    pacific:       { title: "Honeymoon Quiet",      description: "Volcanic islands, palm shadows and dinners delivered by canoe.", photo: U("photo-1573843981267-be1999ff37cd") },
  },
};

/* ─────────────── Curated per-destination guides ─────────────── */

export const DESTINATION_GUIDES: Record<string, DestinationGuide> = {
  "tulum-5-days": {
    hero: U("photo-1518638150340-f706e86654de"),
    tagline:
      "Where ancient Mayan ruins meet the Caribbean. Days dissolve between cenotes and powder-white sand; nights find you at candlelit beach clubs under a tangle of stars.",
    longForm: `Tulum sits on a thin strip of jungle pinned between the Caribbean and a network of flooded limestone caves. The town itself is dusty and walkable, full of taquerías and bike rental shops, while the beach road runs ten kilometers south past thatched hotels, sargassum-flecked sand, and the occasional crumbling Mayan watchtower. Five days is the right amount of time to do this place at the pace it actually wants: late breakfasts, long swims, an early dinner, repeat.

Mornings belong to the cenotes. Gran Cenote and Cenote Calavera sit just outside town and stay relatively quiet before ten. Drive forty minutes inland and you can swim through the cathedral-sized chamber at Cenote Zacil-Ha or follow guides into the cave systems at Dos Ojos. The Tulum Ruins themselves deserve an early start, ideally before eight, when the light is soft and the iguanas have the place to themselves. For a deeper nature day, head south to Sian Ka'an, where boat captains in Punta Allen run lagoon tours through mangrove tunnels and turtle grass flats.

Afternoons are for the beach and the spa. Playa Paraíso remains the public stretch with the cleanest sand. Hotel beach clubs like Mi Amor, Nomade, and Ziggy let day visitors buy in for a lounger and lunch. Wellness is a serious industry here: temazcal ceremonies at Yäan, sound baths at Sanará, and dawn yoga classes that end with fresh coconut water.

Stay in Aldea Zama for mid-range comfort and easy taxis, or book a boutique on the beach road if you want to wake up to surf. Eat tacos in town (Antojitos La Chiapaneca, El Camello Jr.) and save one big night for Hartwood or Arca. November through April is dry and warm; sargassum is least likely in winter. Rent a bike or scooter, carry pesos, and bring reef-safe sunscreen.`,
    themes: [
      { title: "Cenotes & Crystal Pools", description: "Dive into freshwater cenotes hidden in jungle limestone, cool and impossibly clear.", photo: U("photo-1518638150340-f706e86654de") },
      { title: "Ancient Mayan Ruins",     description: "Walk the cliffside ruins of Tulum at sunrise before the heat and the crowds arrive.", photo: U("photo-1568402102990-bbd4d11dee7c") },
      { title: "Boho Beach Clubs",        description: "Macramé hammocks, mezcal cocktails and DJ sets that drift into golden hour.", photo: U("photo-1507525428034-b723cf961d3e") },
      { title: "Yucatán Cuisine",         description: "Tacos al pastor, fresh ceviche and slow-cooked cochinita pibil from open-air kitchens.", photo: U("photo-1565299585323-38d6b0865b47") },
      { title: "Wellness & Yoga",         description: "Sunrise yoga on the sand, temazcal ceremonies and beachfront massages.", photo: U("photo-1545205597-3d9d02c29597") },
      { title: "Cycling the Coast",       description: "Pedal the long ribbon of road between jungle and sea, the best way to see Tulum.", photo: U("photo-1485965120184-e220f721d03e") },
    ],
  },
  "tokyo-10-days": {
    hero: U("photo-1540959733332-eab4deabeeaf"),
    tagline:
      "A city of paradoxes, neon-soaked crossings and quiet shrines, vending-machine ramen and three-Michelin-star sushi. Ten days here is barely enough.",
    longForm: `Tokyo at ten days lets you stop sprinting. You can spend a morning watching octogenarian sushi chefs at Tsukiji's outer stalls, take the afternoon off in a Daikanyama bookstore, and still have time for an hour-long ramen queue in Shinjuku that night. The city rewards repetition: returning to the same neighborhood at a different hour reveals an entirely different place. Shibuya at 8 a.m. is salarymen and convenience-store coffee. Shibuya at 11 p.m. is the Scramble in full chaos and standing bars filling up along Nonbei Yokocho.

Build the trip in halves. Spend the first five days inside the JR Yamanote loop: Senso-ji and the knife shops on Kappabashi-dori, Meiji Jingu's gravel paths, the teamLab Planets installation in Toyosu, izakaya crawls through Ebisu Yokocho. Anchor one evening in Golden Gai, where each tiny bar has its own rules and regulars. Use the second half for slower districts. Yanaka and Nezu hold the prewar wooden Tokyo most travelers miss. Shimokitazawa runs on vintage shops and live houses. A day trip to Kamakura's Great Buddha or an afternoon at the Ghibli Museum in Mitaka breaks up the density.

Eat widely. Tonkatsu in Tonki, hand-pulled soba in Kanda, monjayaki in Tsukishima, conveyor sushi in any neighborhood you happen to be tired in. Department-store basements (depachika) at Isetan and Takashimaya solve lunch on travel days.

Mid-range lodging works best in Shinjuku, Ginza, or Asakusa, where business hotels run 15,000–25,000 yen a night with tiny but flawless rooms. Get a Suica card on arrival. Aim for late March cherry blossoms or early November ginkgo gold; avoid August humidity if you can.`,
    themes: [
      { title: "Neon Nights in Shibuya",  description: "The world's busiest crossing, izakayas tucked into back-alleys and karaoke until sunrise.", photo: U("photo-1540959733332-eab4deabeeaf") },
      { title: "Shrines & Quiet Gardens", description: "Meiji Jingu, Senso-ji and the small neighborhood shrines that hide between skyscrapers.", photo: U("photo-1545569341-9eb8b30979d9") },
      { title: "The Best Food on Earth",  description: "Counter sushi, hand-pulled ramen, conveyor-belt curiosities and convenience-store classics.", photo: U("photo-1535007813616-79dc02ba4021") },
      { title: "Harajuku & Style",        description: "Vintage boutiques, cult sneaker drops and the most-photographed street fashion in the world.", photo: U("photo-1542931287-023b922fa89b") },
      { title: "Day Trip to Hakone",      description: "Onsen, ryokan stays and a clear-day glimpse of Mt. Fuji from the lakeside.", photo: U("photo-1480796927426-f609979314bd") },
      { title: "TeamLab & Modern Art",    description: "Immersive digital worlds, contemporary galleries and the Mori at the top of Roppongi Hills.", photo: U("photo-1549693578-d683be217e58") },
    ],
  },
  "lisbon-5-days": {
    hero: U("photo-1555881400-74d7acaacd8b"),
    tagline:
      "Pastel facades and trams that climb impossible hills. Days end with grilled sardines, a glass of vinho verde and fado drifting from an open window.",
    longForm: `Lisbon sits on seven hills above the Tagus, and you feel every one in your calves. Light bounces off the river and the white limestone calçada, turning ordinary afternoons coppery by four. Five days suits the city's rhythm: long lunches, an obligatory siesta, then second winds that stretch past midnight in Bairro Alto. The pace stays balanced if you commit to one neighborhood per day instead of chasing the whole map.

Start in Alfama and Mouraria, the tangle of stairs and azulejo-clad facades that survived the 1755 earthquake. Climb to São Jorge Castle for the view, then drop into a fado house like Mesa de Frades or Tasca do Chico for the late set. Day two belongs to Belém: the Jerónimos Monastery, the original Pastéis de Belém counter (ask for cinnamon), and the MAAT museum's wave-shaped roof along the water. Save Príncipe Real and Chiado for browsing concept stores and ceramic shops, then cross the bridge feeling to Alcântara for LX Factory's bookshops and weekend market.

For deeper cuts, ride the ferry to Cacilhas for grilled fish at Ponto Final with Lisbon glowing across the water, or take the train 40 minutes to Sintra for Pena Palace and Quinta da Regaleira's mossy initiation well. Both make easy day trips that don't blow up the itinerary.

Eat seafood rice at Cervejaria Ramiro, bifana sandwiches at O Trevo, and petiscos with orange wine at Taberna da Rua das Flores. Stay in Príncipe Real or Santa Catarina for walkability without Alfama's tourist crush. Spring and early fall avoid the August heat and cruise-ship crowds. Carry coins for espresso and comfortable soles for the cobbles.`,
    themes: [
      { title: "Alfama & the Old Quarter", description: "Cobblestone alleys, blue-tiled facades and the city's oldest fado houses.", photo: U("photo-1555881400-74d7acaacd8b") },
      { title: "Pastéis & Café Culture",   description: "Warm custard tarts straight from the oven, espresso at a marble counter.", photo: U("photo-1551024601-bec78aea704b") },
      { title: "Tram 28 & Viewpoints",     description: "The yellow tram clatters past every miradouro worth standing on at sunset.", photo: U("photo-1518730518541-d0843268c287") },
      { title: "Day Trip to Sintra",       description: "Fairytale palaces in misty hills, a day that feels like a different country.", photo: U("photo-1558102822-da570eb113b8") },
      { title: "Seafood by the Tagus",     description: "Grilled sardines, octopus rice and natural wine on tiled tavern terraces.", photo: U("photo-1414235077428-338989a2e8c0") },
      { title: "Sunset on the Coast",      description: "Cascais cliffs, Cabo da Roca and the wide Atlantic glowing pink at the end of the day.", photo: U("photo-1493558103817-58b2924bce98") },
    ],
  },
  "bali-7-days": {
    hero: U("photo-1537996194471-e657df975ab4"),
    tagline:
      "Rice terraces glowing green at dawn, surf breaks at lunch, beach clubs at dusk. Bali holds room for adventure, ceremony and complete stillness, sometimes all in one day.",
    longForm: `Bali compresses several different islands into one. There's the surf-and-smoothie coast around Canggu, the temple-dense interior of Ubud, the dry limestone peninsula of the Bukit, and the quiet east where Mount Agung looms over rice farmers still working by hand. Seven days is enough to sample three of these worlds without rushing, especially if you base yourself in two locations rather than chasing every region.

Most travelers anchor the first half in Ubud. Mornings work best for the Tegallalang terraces and Campuhan Ridge Walk before the heat builds; afternoons are for Ubud Palace, the Neka Art Museum, or a Balinese cooking class in Laplapan. Set aside a half-day for Tirta Empul, where you queue waist-deep to bathe under carved stone spouts. Drivers run roughly 600,000 IDR for a full day and can string together Goa Gajah, the Tegenungan waterfall, and a silver workshop in Celuk.

For the back half, swap jungle for coast. Seminyak and Canggu suit travelers who want beach clubs, natural wine bars on Jalan Pantai Berawa, and warungs serving nasi campur for under five dollars. The Bukit peninsula is quieter and more dramatic: Bingin, Padang Padang, and Nyang Nyang sit below cliffs, and the Kecak chant performance at Uluwatu around 6pm is the rare set-piece that earns the hype.

Eat babi guling at Ibu Oka, grilled snapper at Jimbaran Bay, and breakfast bowls anywhere in Pererenan. Mid-range villas with private pools run 80 to 150 USD nightly. Visit between May and September for dry skies; pack a sarong for temple entries and download Grab and Gojek before you land.`,
    themes: [
      { title: "Ubud's Rice Terraces",  description: "Walk the carved green steps of Tegallalang in the cool of early morning.", photo: U("photo-1537996194471-e657df975ab4") },
      { title: "Temples & Ceremony",    description: "Cliffside Uluwatu at sunset, water temples at sunrise, daily offerings on every doorstep.", photo: U("photo-1539650116574-75c0c6d73f6e") },
      { title: "Canggu Beach Clubs",    description: "Sunset cocktails at Single Fin, infinity pools and DJ sets long into the night.", photo: U("photo-1507525428034-b723cf961d3e") },
      { title: "Surf & Swim",           description: "Mellow long-boarding at Batu Bolong or barrels at Uluwatu, Bali has a wave for everyone.", photo: U("photo-1502933691298-84fc14542831") },
      { title: "Wellness & Yoga",       description: "Daily flow at the Yoga Barn, jungle spa days and breakfast bowls under thatched roofs.", photo: U("photo-1545205597-3d9d02c29597") },
      { title: "Waterfalls & Volcanoes", description: "Sunrise hike up Mt. Batur or chase hidden waterfalls in the jungle around Munduk.", photo: U("photo-1531168556467-80aace0d0144") },
    ],
  },
  "dubai-4-days": {
    hero: U("photo-1512453979798-5ea266f8880c"),
    tagline:
      "A skyline that looks invented and a desert that feels eternal. Dubai turns up the volume on everything, brunches, beaches, towers and the silence between dunes.",
    longForm: `Dubai is a city that built itself on superlatives, but four days here works best when you stop counting tallest-this and biggest-that and start paying attention to texture: the cool marble of a hotel lobby after 40-degree heat, the smell of oud drifting from a souk stall, the call to prayer threading through traffic on Sheikh Zayed Road. A balanced luxury itinerary lets you alternate poolside mornings with late afternoons in the older quarters, when the light goes amber and Instagram suddenly makes sense.

Base yourself in Downtown or on Palm Jumeirah for the first two nights. Mornings are for the beach or the spa at Bulgari Resort or One&Only The Palm. Late afternoon, head to Al Fahidi, where wind-tower houses shade galleries and the Arabian Tea House serves saffron lemonade in a courtyard. Cross the Creek by abra for one dirham, wander the Gold Souk, and finish with mezze at Al Ustad Special Kebab in Bur Dubai. Day three belongs to the desert: book a Platinum Heritage vintage Land Rover tour into Al Marmoom for falconry, camel rides, and a low-table dinner under the stars.

Save day four for the showpieces. Sunrise at the Burj Khalifa beats the haze. Lunch at Orfali Bros, currently the best restaurant in the Middle East, requires booking weeks ahead. End at the Museum of the Future, then drinks at CÉ LA VI on the 54th floor of Address Sky View.

Visit between November and March; summer is genuinely brutal. Careem and Uber are cheaper than taxis. Dress code is relaxed at hotels but modest in souks and mosques. Tipping 10 to 15 percent is standard at restaurants.`,
    themes: [
      { title: "The Skyline",          description: "Burj Khalifa at sunset, the Marina at night, observation decks above the clouds.", photo: U("photo-1512453979798-5ea266f8880c") },
      { title: "Desert & Dunes",       description: "4×4 dune drives, camel rides and dinner under the stars at a Bedouin camp.", photo: U("photo-1509316785289-025f5b846b35") },
      { title: "Beach Clubs & Brunch", description: "Daybeds at Nikki Beach, free-flow brunches and infinity pools above the Gulf.", photo: U("photo-1582719508461-905c673771fd") },
      { title: "Old Dubai & the Souks", description: "Wooden abras across the Creek, gold and spice markets, the original heart of the city.", photo: U("photo-1518684079-3c830dcef090") },
      { title: "Modern Architecture",  description: "The Museum of the Future, the Frame and a skyline that's still being drawn.", photo: U("photo-1518684079-3c830dcef090") },
      { title: "Day at the Palm",      description: "Atlantis, beach days on the Crescent and dinner with a view of the whole city.", photo: U("photo-1546412414-e1885259563a") },
    ],
  },
  "barcelona-5-days": {
    hero: U("photo-1583422409516-2895a77efded"),
    tagline:
      "Gaudí's curves against Mediterranean blue. Tapas crawls in the Gothic Quarter, late dinners by the sea, and the kind of city that makes you stay one more day.",
    longForm: `Barcelona sits between the Collserola hills and the Mediterranean, and you feel both within an hour of landing. The light is sharp, the pavement smells faintly of orange peel and tobacco, and the city's grid (Cerdà's nineteenth-century Eixample) makes it walkable in a way most European capitals aren't. Five days is the right length: enough to see the Gaudí landmarks, eat your way through three or four neighborhoods, and still take a slow Sunday in the Gothic Quarter without rushing.

Spend the first two days in the center. Start early at Sagrada Família, then drift down Passeig de Gràcia toward El Born for lunch at Bar del Pla or a long sit at Cal Pep's counter. The Picasso Museum and the Santa Maria del Mar basilica are five minutes apart. Reserve an evening for Palau de la Música Catalana, whose mosaic ceiling alone justifies the ticket. Day three belongs to Gràcia: smaller plazas, vermouth at Bodega Marín, and the climb up to Park Güell and the Bunkers del Carmel for sunset.

Save a day for the water. La Barceloneta still grills sardines on beachfront spits at Can Solé and El Vaso de Oro, and the Ciutadella park nearby is good for an afternoon off your feet. Day five, push into El Raval for MACBA, natural wine at Bar Salvatge, and dinner at Suculent before a late night around Plaça Reial.

Mid-range hotels in Eixample or El Born run 180 to 280 euros. Dinner starts at 9:30, clubs after 1. Avoid August (locals leave, heat is punishing); May, June, and late September are ideal. The metro is fast, but most of what you'll want is walkable.`,
    themes: [
      { title: "Gaudí's Barcelona",       description: "Sagrada Familia, Park Güell and Casa Batlló, buildings that feel grown, not built.", photo: U("photo-1583422409516-2895a77efded") },
      { title: "Gothic Quarter Wandering", description: "Narrow medieval streets, hidden plazas and the best vermouth bars in Spain.", photo: U("photo-1539037116277-4db20889f2d4") },
      { title: "Tapas & Pintxos",         description: "Standing-room-only bars, jamón ibérico and chefs slicing fresh anchovies in front of you.", photo: U("photo-1414235077428-338989a2e8c0") },
      { title: "Beach & Barceloneta",     description: "City-beach swims, paella by the water and sunset cocktails on the boardwalk.", photo: U("photo-1469854523086-cc02fe5d8800") },
      { title: "Markets & Local Life",    description: "La Boqueria at opening time, neighborhood markets and the city's best slow lunches.", photo: U("photo-1481437156560-3205f6a55735") },
      { title: "Nightlife in El Born",    description: "Cocktail dens, terrace bars and clubs that don't get going until well after midnight.", photo: U("photo-1514525253161-7a46d19cd819") },
    ],
  },
  "mexico-7-days": {
    hero: U("photo-1568402102990-bbd4d11dee7c"),
    tagline:
      "Mayan pyramids in jungle clearings, cenotes hidden under limestone and colonial cities painted every color. A week barely scratches the surface, but what a week.",
    longForm: `A week in Mexico forces choices. The country sprawls from desert canyons in Chihuahua to Caribbean reefs off Quintana Roo, and trying to see all of it in seven days is how travelers end up exhausted in airport lounges. The smarter play is to anchor in two or three regions that talk to each other: the highland capital, a colonial state with deep food roots, and a coast or ruin site to close things out.

Start in Mexico City. Three days lets you cover Centro Histórico (Zócalo, Templo Mayor, Palacio de Bellas Artes), eat your way through Roma Norte and Condesa, and take the bus out to Teotihuacán for sunrise at the pyramids. Save an evening for lucha libre at Arena México or pulque at La Hija de los Apaches. From CDMX, a short flight south drops you in Oaxaca, where the cooking gets serious: mole negro at Casa Oaxaca, tlayudas grilled over charcoal, mezcal aged in glass demijohns. Day trip to Hierve el Agua's mineral pools or the Zapotec ruins at Monte Albán.

If beaches matter more than mountains, swap Oaxaca for the Yucatán. Fly into Mérida or Cancún, base in Valladolid or Tulum, and split time between cenote swimming, Chichén Itzá or Uxmal, and the reef. Sian Ka'an Biosphere is the quieter alternative to Tulum's beach club scene.

Mid-range hotels run $80 to 
    themes:80 a night in cities, more on the coast. Internal flights on Volaris and Aeroméxico beat overnight buses for a 7-day trip. Best windows: November through April for dry weather; avoid Semana Santa unless you've booked everything months out.`,
    themes: [
      { title: "Ancient Ruins",      description: "Walk Chichén Itzá, Tulum and the lesser-known temples lost in the Yucatán jungle.", photo: U("photo-1568402102990-bbd4d11dee7c") },
      { title: "Cenotes & Caves",    description: "Swim in freshwater pools beneath the jungle floor, the Mayan underworld, made for floating.", photo: U("photo-1518638150340-f706e86654de") },
      { title: "Caribbean Beaches",  description: "Powder sand, warm turquoise water and beach clubs with their feet in the sea.", photo: U("photo-1507525428034-b723cf961d3e") },
      { title: "Mexican Cuisine",    description: "Tacos al pastor, mole, cochinita pibil and the kind of mezcal you can only find here.", photo: U("photo-1565299585323-38d6b0865b47") },
      { title: "Colonial Cities",    description: "Pastel-painted streets, baroque cathedrals and rooftop bars that catch the breeze.", photo: U("photo-1518105779142-d975f22f1b0a") },
      { title: "Markets & Mezcal",   description: "Local artisan markets, mezcalerías and the slow rituals around Mexico's most-prized spirit.", photo: U("photo-1551024601-bec78aea704b") },
    ],
  },
  "new-york-4-days": {
    hero: U("photo-1496442226666-8d4d0e62e6e9"),
    tagline:
      "The city that taught everywhere else how to be a city. Bagels at dawn, gallery hops by day, rooftop bars after dark, four days, fifty memories.",
    longForm: `New York at a fast pace is the only honest way to do it in four days. The city compresses cuisines, languages, and centuries into a few square miles of asphalt, and the subway makes all of it reachable by 1am. Plan to walk twelve miles a day, eat five small meals instead of three big ones, and accept that you will not see everything. The trade-off is range: a Vermeer at the Frick before lunch, a Sichuan hot pot in Flushing for dinner, a warehouse party in Bushwick after midnight.

Anchor your days by neighborhood rather than checklist. Spend one morning in the Lower East Side and Chinatown, threading between Russ & Daughters, Tenement Museum tours, and dim sum at Nom Wah Tea Parlor. Give another to the museum corridor along Central Park's east edge, where the Met alone deserves three hours. Cross to Brooklyn for at least one full evening: dinner at Lilia or Win Son in Williamsburg, drinks at Maison Premiere, then a show at Elsewhere or House of Yes. Save Greenwich Village for a slow night of jazz at the Village Vanguard followed by a walk through Washington Square.

For mid-range lodging, look at the Ace Hotel in NoMad, Pod 39, or the Moxy Chelsea, all walkable to multiple subway lines. Skip cabs except late at night; the 6, L, and A trains will cover most of your itinerary. Reserve dinners two weeks out for anything trendy, and keep lunch flexible for walk-in counters and bodegas. Spring and early fall bring the best weather, but the city runs hard year-round.`,
    themes: [
      { title: "Iconic Skyline",            description: "Top of the Rock at sunset, the Brooklyn Bridge at dusk, the Empire State at night.", photo: U("photo-1496442226666-8d4d0e62e6e9") },
      { title: "Neighborhood by Neighborhood", description: "SoHo to West Village to Williamsburg, each block its own personality.", photo: U("photo-1543716091-a840c05249ec") },
      { title: "top-tier Eats",          description: "Bagels, slices, dim sum, omakase and the late-night diner you'll dream about.", photo: U("photo-1414235077428-338989a2e8c0") },
      { title: "Galleries & Museums",       description: "The Met, MoMA, the Whitney and a hundred small galleries hiding in Chelsea lofts.", photo: U("photo-1466442929976-97f336a657be") },
      { title: "Central Park",              description: "Boating in summer, ice skating in winter, the city's living room in every season.", photo: U("photo-1534430480872-3498386e7856") },
      { title: "Broadway & Beyond",         description: "A Broadway show, an off-off-Broadway gem and jazz in a basement in the Village.", photo: U("photo-1514525253161-7a46d19cd819") },
    ],
  },
  "london-5-days": {
    hero: U("photo-1486299267070-83823f5448dd"),
    tagline:
      "Centuries layered street by street, palaces and pubs, markets and museums, all of it walkable if you wear the right shoes.",
    longForm: `London does not reveal itself in a single neighborhood. Five days is enough to draw a rough map: the museum quarter around Bloomsbury, the river spine from Tower Bridge to the South Bank, the eating-and-drinking grid of Soho and Shoreditch, and one westward day around Notting Hill or Kensington. Pace yourself. The Tube is fast but the walks between stops, through Georgian squares and over canal bridges, are usually the better part of the day.

Start with the heavy-hitters while your legs are fresh. The British Museum is free and overwhelming; give it two hours, not four. The Tower of London pairs naturally with a South Bank walk past Borough Market, where you can graze on Kappacasein raclette and Bread Ahead doughnuts before crossing to Tate Modern. Save a full afternoon for the V&A in South Kensington, then dinner in Chelsea or back east at St. John in Smithfield, where bone marrow on toast still defines modern British cooking.

Nights belong to Soho and the East End. Pre-dinner cocktails at Swift on Old Compton Street, ramen at Koya Bar, then a late set at Ronnie Scott's or a DJ night at Phonox in Brixton. Shoreditch handles the rowdier end: Spitalfields on weekends, natural wine at Sager + Wilde, dancing at XOYO until the Overground starts running again around 5am.

Stay in Bloomsbury, Marylebone, or Shoreditch for mid-range hotels with quick Tube access; the Hoxton chain is reliable across all three. Book Dishoom, St. John, and any Michelin-starred lunch a month ahead. May, June, and September bring the best weather and the longest evenings, with light lingering past 9pm. Carry a contactless card; cash is nearly obsolete.`,
    themes: [
      { title: "Royal & Historic",     description: "Westminster, the Tower, Buckingham Palace and the small streets that still feel medieval.", photo: U("photo-1486299267070-83823f5448dd") },
      { title: "top-tier Museums",  description: "The British Museum, the V&A, the Tate, and most of them are free.", photo: U("photo-1466442929976-97f336a657be") },
      { title: "Pubs & Sunday Roasts", description: "Wood-paneled pubs, garden beers and a Sunday roast that lasts most of the afternoon.", photo: U("photo-1514933651103-005eec06c04b") },
      { title: "Markets & Eats",       description: "Borough Market, Brick Lane, Maltby Street, London eats brilliantly, all over town.", photo: U("photo-1481437156560-3205f6a55735") },
      { title: "Theatreland",          description: "West End shows, fringe theatre and the long pre-show pint at a 300-year-old pub.", photo: U("photo-1514525253161-7a46d19cd819") },
      { title: "Parks & Green Spaces", description: "Hyde Park, Hampstead Heath and the canal-side walks that feel miles from the city.", photo: U("photo-1534430480872-3498386e7856") },
    ],
  },
  "bangkok-5-days": {
    hero: U("photo-1508009603885-50cf7c579365"),
    tagline:
      "A city that runs on heat, motorbikes and street food smoke. Gilded temples in the morning, rooftop bars by night, Bangkok rewards anyone who keeps up.",
    longForm: `Bangkok runs on heat, traffic, and the constant smell of something delicious cooking on a sidewalk. Five days is the right length to handle this city without burning out: enough time to see the temples properly, eat your way through three or four distinct neighborhoods, and still have a night where you do nothing but bar-hop in Thonglor. The trick is pacing. Mornings belong to sightseeing before the humidity peaks, late afternoons to river ferries and massages, evenings to whatever street is grilling something over charcoal.

Begin in Rattanakosin, the old royal island, where Wat Pho, the Grand Palace, and Wat Arun cluster within walking distance. Spend a half-day at Jim Thompson House to understand the silk trade, then ride the Chao Phraya Express boat north to the flower market at Pak Khlong Talat. Chinatown deserves a full evening: start with dim sum on Charoen Krung Road, work toward Yaowarat for grilled prawns at Lek and Rut, finish with sweet pandan custard from a cart. Save a day for Chatuchak if your trip hits a weekend, or swap in the canals of Thonburi by longtail.

Nights move between two registers. For craft cocktails and rooftops, head to Sukhumvit: Vesper, Tropic City, and Sky Bar at Lebua. For something rowdier, Soi 11 and the alleys around Khao San still deliver cheap Chang and live bands until late. Thonglor splits the difference with smaller listening bars and izakaya-style spots.

Mid-range hotels in Silom or Sukhumvit run 3,000 to 5,000 baht and put you on the BTS Skytrain, which beats traffic. Visit November through February for cooler, drier weather. Always carry small bills for taxis and street food.`,
    themes: [
      { title: "Glittering Temples",     description: "Wat Pho, Wat Arun and the Grand Palace, gold and tilework that catches the morning sun.", photo: U("photo-1508009603885-50cf7c579365") },
      { title: "Street Food Crawl",      description: "Pad thai at midnight, mango sticky rice from a cart, boat noodles in a 50-year-old shop.", photo: U("photo-1559314809-0d155014e29e") },
      { title: "Markets at Every Hour",  description: "Chatuchak by day, Asiatique at sunset, Khao San after midnight, Bangkok never closes.", photo: U("photo-1481437156560-3205f6a55735") },
      { title: "Rooftop Bars",           description: "Cocktails 60 floors above the river, Lebua, Vertigo, the unnamed ones the locals love.", photo: U("photo-1582719508461-905c673771fd") },
      { title: "Klongs & River Life",    description: "Long-tail boats through the canals, sunset on the Chao Phraya and floating markets at dawn.", photo: U("photo-1493020258366-be3ead61c4e0") },
      { title: "Day Trip to Ayutthaya",  description: "The ruined royal capital, temples reclaimed by jungle, a 90-minute train ride away.", photo: U("photo-1539650116574-75c0c6d73f6e") },
    ],
  },
  "bora-bora-5-days": {
    hero: "",
    tagline: "Mount Otemanu rises from a lagoon so clear the shadow of your overwater bungalow ripples across white sand twelve feet below. Five days here moves at the speed of trade winds and outrigger paddles.",
    longForm: `Bora Bora is small. You can drive the ring road around the main island in under an hour, which means most of the trip happens on the water or just above it. The lagoon does the heavy lifting here: a 25-square-mile bowl of pale blue ringed by motus and protected by a barrier reef, with the twin volcanic peaks of Mount Otemanu and Mount Pahia rising 2,300 feet from the center. Five days is the right length to settle in, slow down, and actually use the bungalow you're paying for.

Base yourself on one of the resort motus. The Four Seasons, St. Regis, and Conrad sit on the eastern and northern reef, each with private lagoon frontage and shuttle service to Vaitape, the main village. Spend the first two days doing nothing more strenuous than swimming off your deck and watching the light shift across Otemanu. On day three, book a half-day lagoon tour with Patrick or Lagoon Service: snorkeling with manta rays at Anau, a stop at the coral garden near Motu Tapu, and a barbecue lunch on a private islet with parrotfish grilled over coconut husks.

Save one day for land. A 4x4 safari climbs the interior tracks past abandoned American gun emplacements from 1942 and stops at viewpoints above Faanui Bay. End the afternoon at Matira Beach, the island's best stretch of public sand, where the water stays waist-deep for a long way out. Photographers should plan a sunset sail; the light against Otemanu's basalt face around 5:30 pm is the shot you came for.

Practical notes: fly into Papeete, then connect on Air Tahiti's 50-minute hop to Motu Mute airport, where your resort's boat will meet you. May through October is dry season with steadier trade winds. Meals at resort restaurants run high, so consider a half-board plan, and keep a lunch reservation at Bloody Mary's for the one off-property meal worth the boat ride.`,
    themes: [
      { title: "Matira Beach at golden hour", description: "The island's only public beach, with shallow turquoise water stretching 200 meters offshore and palms framing sunset shots toward Tupai.", photo: "" },
      { title: "Overwater bungalows at Four Seasons or St. Regis", description: "Glass floor panels, private plunge pools, and direct lagoon access on the motu chain facing Mount Otemanu.", photo: "" },
      { title: "Lagoonarium snorkeling with rays and reef sharks", description: "Guided drift snorkels at Anau pass where eagle rays glide through coral gardens and blacktip sharks circle in waist-deep water.", photo: "" },
      { title: "Mount Otemanu 4x4 safari", description: "Half-day jeep tour climbing past WWII cannons and pineapple farms to viewpoints over the barrier reef and Faanui Bay.", photo: "" },
      { title: "Bloody Mary's and Vaitape lunch break", description: "Sand-floor seafood institution near Povai Bay, plus the small market in Vaitape for black pearls and pareo fabric.", photo: "" },
      { title: "Sunset catamaran around the motus", description: "Private sailing charter circling the lagoon, with stops at Motu Tapu and champagne anchored off the coral garden.", photo: "" },
    ],
  },
  "china-12-days": {
    hero: "",
    tagline: "Twelve days, four flights, and the smell of Sichuan peppercorns clinging to your jacket. China at this pace means dawn at the Great Wall and midnight noodles in a Chengdu alley, with bullet trains stitching it all together.",
    longForm: `Twelve days in China is a calculated sprint across a country the size of a continent. You will not see it all, and trying is the wrong instinct. A smarter route runs Beijing to Xi'an to Chengdu to Zhangjiajie to Shanghai, linked by overnight high-speed rail and two short domestic flights. Pack light. The G-trains are fast but the platforms are long, and you will be hauling your bag up hutong steps and into hostel courtyards more than you expect.

Beijing earns three full days. Sunrise at Mutianyu beats Badaling for crowds and photography, and the section near Tower 20 gives you the watchtower-on-watchtower compression shot. Save a half-day for the Forbidden City's lesser visited western palaces and an evening for Peking duck at Siji Minfu near Wangfujing. From Beijing, the bullet train south to Xi'an takes about five hours. Two days here covers the Terracotta Warriors, a sunset bike ride on the Ming city wall, and roujiamo sandwiches in the Hui quarter on Beiyuanmen Street.

Fly to Chengdu for pandas and peppercorns, then on to Zhangjiajie, where the sandstone columns of Wulingyuan and the glass bridge over Grand Canyon give photographers two very different days of vertical drama. Close the loop in Shanghai. Walk the Bund at dusk, then dive into the Former French Concession around Wukang Lu for plane trees, art deco mansions, and natural wine bars.

Mid-range here means three-star international chains or boutique courtyard hotels (around $80 to $150 a night), street food lunches under $5, and Didi rides instead of taxis. Go in late September or October for clear skies and cool temperatures. Download a VPN before you land, get a Chinese eSIM, and load Alipay with a foreign card. Cash is essentially obsolete.`,
    themes: [
      { title: "Beijing's Mutianyu Great Wall", description: "Hike the restored ramparts at sunrise before tour buses arrive, then toboggan down through chestnut forests below the watchtowers.", photo: "" },
      { title: "Xi'an Terracotta Army", description: "Walk Pit 1 at the Qin tomb complex, then bike the 14-kilometer Ming city wall above the Muslim Quarter's lamb skewer smoke.", photo: "" },
      { title: "Chengdu Panda Base and Sichuan Kitchens", description: "Morning with juvenile pandas in Dujiangyan, evenings over mapo tofu and numbing hotpot in Jinli's lantern-lit lanes.", photo: "" },
      { title: "Zhangjiajie Sandstone Pillars", description: "Ride the Bailong elevator up sandstone spires that inspired Avatar, then trek the Golden Whip Stream through misted valleys.", photo: "" },
      { title: "Shanghai's Bund and Former French Concession", description: "Photograph Pudong's skyline from Waitan at blue hour, then wander plane-tree streets around Wukang Mansion and Anfu Lu.", photo: "" },
      { title: "Forbidden City and Hutong Photography", description: "Shoot vermilion gates and gold roofs in the Palace Museum, then lose the crowds in Beijing's Gulou hutong courtyards.", photo: "" },
    ],
  },
  "colombia-9-days": {
    hero: "",
    tagline: "Coffee dries on patios in the Zona Cafetera while salsa horns rattle the windows of Cali's Barrio Obrero. Nine days in Colombia means moving between Andean peaks, Caribbean heat, and the smell of arepas crisping on street griddles before sunrise.",
    longForm: `Colombia stretches from Caribbean reef to Amazon basin to Andean cloud forest, and nine days forces you to pick a spine rather than chase the whole map. Most fast-paced itineraries thread three anchors: Bogotá or Medellín for city culture, the Zona Cafetera for green hills and coffee fincas, then Cartagena and the Caribbean coast to finish in the heat. Internal flights on Avianca and LATAM keep the math workable, usually under an hour between hubs.

Start in Medellín. The Metrocable up to Comuna 13 reframes what a city tour can be, and Provenza in El Poblado handles dinner with places like Carmen and El Cielo. From there, a short flight or scenic drive drops you into Pereira or Armenia for the coffee triangle. Base in Salento or Filandia, hike the Cocora Valley early before clouds swallow the wax palms, and book a finca visit at Don Elías or El Ocaso to follow a bean from cherry to cup.

Cartagena handles the back half. Stay inside the walls or in Getsemaní, which has shed some of its grit but still hosts the best street art and the loudest plaza nights. Day-trip to the Rosario Islands by speedboat, or push north to Tayrona for jungle hiking and beach hammocks at Cabo San Juan. Skip Bogotá only if you must; one night for ajiaco in La Candelaria and the Gold Museum is worth the detour.

Mid-range hotels run 90 to 180 USD in tourist zones, less in the coffee region. Eat lunch at a menú del día for around 25,000 pesos. Go December through March for dry weather on the coast. Carry cash for fincas and small towns, and use Cabify or InDriver over hailed taxis in the bigger cities.`,
    themes: [
      { title: "Comuna 13 Walking Tour, Medellín", description: "Ride the outdoor escalators through hillside graffiti and hear from guides who lived through the neighborhood's transformation.", photo: "" },
      { title: "Cartagena's Walled City and Getsemaní", description: "Wander balconied colonial streets by day, then catch champeta dancers in Plaza de la Trinidad after dark.", photo: "" },
      { title: "Salento and the Cocora Valley", description: "Hike past wax palms taller than ten-story buildings, then tour a working finca to taste single-origin coffee at the source.", photo: "" },
      { title: "Bogotá's La Candelaria and Monserrate", description: "Cable-car up to 3,150 meters for city views, then eat ajiaco in the historic quarter near the Botero Museum.", photo: "" },
      { title: "Tayrona National Park", description: "Trek through coastal jungle to Cabo San Juan, where hammocks hang above a beach pinned between boulders and sea.", photo: "" },
      { title: "Bandeja Paisa and Street Food Crawl", description: "Work through chicharrón, arepas de chócolo, buñuelos, and obleas across Medellín's Provenza and Mercado del Río.", photo: "" },
    ],
  },
  "costa-rica-7-days": {
    hero: "",
    tagline: "Howler monkeys wake you before the sun clears the canopy, and by noon you're floating in a thermal river downstream of Arenal. Seven days is enough to pair volcanoes with two coastlines.",
    longForm: `The first thing you notice in Costa Rica is the noise. Cicadas at dawn, howler monkeys claiming territory across valleys, rain hitting banana leaves in fat percussive drops. The country is small enough to cross by car in a day, but the terrain shifts so fast that a morning in cloud forest can end with sunset cocktails on a Pacific beach. Seven days lets you string together two or three distinct ecosystems without rushing, which is exactly how this place wants to be traveled.

Most itineraries start in the Northern Lowlands around La Fortuna, where Arenal Volcano rises in a near-perfect cone above pastureland. Spend two nights here for waterfall rappelling, the Río Celeste hike in nearby Tenorio, and an evening soak at Tabacón. From there, the winding road to Monteverde climbs into Tilarán cloud forest, where ziplines launch above mossy canopy and night walks turn up red-eyed tree frogs and eyelash vipers.

The second half of the week typically drops down to the coast. Manuel Antonio packs the most wildlife per square kilometer of any park in the country, and you can pair morning hikes with afternoons on Playa Espadilla. Surfers and yoga travelers head further north to Nosara or Santa Teresa instead, where dirt roads, beach breaks, and farm-to-table sodas set the rhythm.

Mid-range lodges run $120 to $220 a night and usually include breakfast (gallo pinto, fresh papaya, strong coffee from Tarrazú). Rent a 4WD; potholes and river crossings are real. Dry season runs December through April, but the green months of May, June, and November offer fewer crowds and dramatic afternoon storms that clear by dinner.`,
    themes: [
      { title: "Arenal Volcano and Tabacón Hot Springs", description: "Hike the 1968 lava trail at dusk, then soak in mineral-heated rivers winding through rainforest north of La Fortuna.", photo: "" },
      { title: "Monteverde Cloud Forest", description: "Walk suspension bridges through fog-soaked oak canopy where resplendent quetzals nest from March to July.", photo: "" },
      { title: "Manuel Antonio Beaches and Wildlife", description: "Pacific coves backed by jungle where sloths and white-faced capuchins move through almond trees above the sand.", photo: "" },
      { title: "Río Celeste and Tenorio Volcano", description: "A turquoise river fed by mineral reactions, reached via a muddy 6km trail through Tenorio National Park.", photo: "" },
      { title: "Tortuguero Canals", description: "Boat-only village on the Caribbean side where green sea turtles nest July through October along black-sand beaches.", photo: "" },
      { title: "Nosara Surf and Yoga", description: "Playa Guiones offers consistent beach breaks for all levels, with sunrise yoga shalas tucked into the dry forest above.", photo: "" },
    ],
  },
  "croatia-7-days": {
    hero: "",
    tagline: "Limestone islands scatter down the Adriatic like stepping stones, the water so clear you can count sea urchins ten meters down. Pine resin hangs in the afternoon heat, and church bells echo across stone harbors at dusk.",
    longForm: `Croatia stretches its coastline along more than a thousand islands, and a week here means choosing your slice carefully. Most travelers split seven days between the Dalmatian coast and one inland detour, flying into Split or Dubrovnik and ferrying outward. The country runs on a slower clock once you leave the walled cities. Mornings are for swimming, afternoons for shade and long lunches of grilled branzino with blitva, evenings for walking stone alleys until the cafés spill onto the squares.

Start in Split, where Diocletian's Palace is not a museum but a living quarter with apartments built into 4th-century walls and laundry strung between Roman columns. From here, ferries fan out to Hvar, Brač, and Vis. Hvar town draws the yacht crowd, but the island's interior holds lavender fields around Velo Grablje and the abandoned village of Malo Grablje, where one family still cooks in a stone konoba. Vis, further out and quieter, rewards the extra ferry hour with the Blue Cave at Biševo and Komiža's fishing harbor.

Inland, Plitvice and Krka offer two different waterfall experiences: Plitvice for the scale and turquoise pools, Krka for actually getting in the water. Drivers can connect them with a stop in Zadar to hear the Sea Organ at sunset. Istria, up north, plays by different rules, with hill towns like Grožnjan and Rovinj that feel more Venetian than Balkan.

Mid-range travelers do well in family-run sobe (rooms) and small hotels, budgeting around 120-180 euros per night in shoulder season. Go in late May, early June, or September to avoid August crowds and Adriatic heat. Rent a car for inland sections; rely on Jadrolinija ferries between islands.`,
    themes: [
      { title: "Plitvice Lakes National Park", description: "Sixteen terraced lakes connected by waterfalls and wooden boardwalks, best walked early before the tour buses arrive from Zagreb.", photo: "" },
      { title: "Sailing the Pakleni Islands", description: "Day-charter from Hvar town to anchor at Palmižana, swim off the boat, and eat grilled fish at Toto's or Laganini.", photo: "" },
      { title: "Dubrovnik's Old Town Walls", description: "Two kilometers of 13th-century ramparts circling terracotta rooftops; go at opening or after 6pm to skip cruise crowds.", photo: "" },
      { title: "Istria's Truffle Country", description: "Hunt black truffles around Motovun with Karlić family dogs, then taste Malvazija wine at Kabola or Kozlović vineyards.", photo: "" },
      { title: "Brač Island and Zlatni Rat", description: "The shifting white-pebble spit at Bol pulls windsurfers from June through September; ferry over from Split in under an hour.", photo: "" },
      { title: "Krka National Park Swimming", description: "Skradinski Buk falls allow swimming in summer mornings; combine with a boat to Visovac Monastery on its tiny island.", photo: "" },
    ],
  },
  "czech-republic-5-days": {
    hero: "",
    tagline: "Five days in the Czech Republic move between Prague's cobblestones and Bohemia's beer cellars, where the air smells of malt and woodsmoke and Gothic spires throw long shadows across the Vltava at dusk.",
    longForm: `Prague does most of the heavy lifting on a five-day Czech trip, and that's fine. The capital rewards slow walking: cobbled lanes in Malá Strana, the smell of trdelník smoke drifting off Old Town Square, the clang of trams climbing toward the castle. Five days gives you three in Prague and two for day trips or an overnight in Bohemia, which is the sweet spot for a budget traveler stretching koruna across cheap pivo and pension rooms.

Start in Staré Město and Malá Strana for the postcard hits, then spend a night in Žižkov or Vinohrady where locals actually drink. Žižkov's pubs pour Kozel and Staropramen for under 50 CZK, and U Vystřeleného Oka stays loud past midnight. For food, skip the tourist goulash on the square and head to Lokál or Café Savoy for proper svíčková, roast pork with dumplings, and pickled cheese called nakládaný hermelín.

Outside Prague, two day trips earn the train fare. Kutná Hora delivers the macabre Sedlec Ossuary and a quiet Gothic cathedral in under three hours round trip. Český Krumlov is further south and worth an overnight if you can swing it, with its castle, riverside beer gardens, and medieval lanes that empty out after the day-trippers leave. Plzeň works as a half-day for the Pilsner Urquell brewery tour.

Visit in May, June, or September for warm evenings without August crowds. Trains from Praha hlavní nádraží are cheap and reliable; book RegioJet or České dráhy in advance. Hostels in Vinohrady run 400-600 CZK a night, and a full meal with two beers rarely tops 350 CZK.`,
    themes: [
      { title: "Prague Old Town and Charles Bridge", description: "Walk the Astronomical Clock at the top of the hour, then cross Charles Bridge before sunrise to dodge the crowds.", photo: "" },
      { title: "Žižkov Pub Crawl", description: "Prague's scruffiest district has more bars per capita than anywhere in the country, including the cult dive U Sadu.", photo: "" },
      { title: "Pilsner Urquell Brewery, Plzeň", description: "Tour the original 1842 lager cellars and taste unfiltered beer drawn straight from oak barrels underground.", photo: "" },
      { title: "Vinohrady Food Halls and Beer Gardens", description: "Manifesto Market and Riegrovy Sady serve goulash, svíčková, and half-liter pours under string lights.", photo: "" },
      { title: "Český Krumlov Day Trip", description: "A UNESCO town on a river bend in South Bohemia, walkable in an afternoon with a castle perched above red rooftops.", photo: "" },
      { title: "Kutná Hora and the Sedlec Ossuary", description: "An hour from Prague, this silver-mining town holds a chapel decorated with the bones of 40,000 people.", photo: "" },
    ],
  },
  "egypt-7-days": {
    hero: "",
    tagline: "Seven days tracing the Nile from Cairo's car-horn clamor to the sandstone hush of Aswan, where felucca sails snap against a dry desert wind that carries the faint smell of cardamom from riverside cafés.",
    longForm: `Egypt in a week is a logistical puzzle that rewards a flight or two. Cairo gets you in the door with the Pyramids and the new Grand Egyptian Museum, but the country's pull is the long stretch of Nile south of it, where temple walls still hold their pigment and the river does most of the moving for you. Seven days is enough to hit the headline sites without spending every afternoon in a minivan, provided you book the EgyptAir hop down to Luxor or Aswan early.

Start in Cairo with two nights. The Grand Egyptian Museum near Giza now holds Tutankhamun's full collection, and you can pair a morning there with an afternoon at Saqqara, quieter than Giza and home to some of the oldest stone architecture on earth. Evenings belong to Islamic Cairo: Al-Azhar Park at sunset, then dinner at Abou Tarek for koshari, the lentil-rice-pasta tangle Egyptians eat standing up. Fly south next. Luxor's East Bank holds Karnak's hypostyle hall and Luxor Temple lit gold after dark; the West Bank needs a full day for the Valley of the Kings and Hatshepsut's temple. A Nile cruise or a fast train carries you on to Aswan for feluccas, Philae, and a pre-dawn convoy to Abu Simbel.

For a photography-leaning detour, swap one Nile day for an overnight in the White Desert from Bahariya Oasis. The wind-carved chalk towers at moonrise are one of the more surreal things in North Africa.

Mid-range here stretches further than most travelers expect. Expect to pay around 80 to 150 USD a night for places like the Steigenberger in Cairo or the Sofitel Old Cataract in Aswan during shoulder season. October through April is the window; summer in Upper Egypt regularly clears 40°C. Carry small bills for baksheesh, dress modestly at mosques, and hire a licensed Egyptologist guide for at least the Luxor day. It changes what you see.`,
    themes: [
      { title: "Giza Plateau and Saqqara", description: "Sunrise at the Pyramids before tour buses arrive, then the Step Pyramid of Djoser and the painted tombs at Saqqara.", photo: "" },
      { title: "Luxor's West Bank Tombs", description: "Valley of the Kings, Hatshepsut's terraced temple at Deir el-Bahari, and the Colossi of Memnon in early morning light.", photo: "" },
      { title: "Khan el-Khalili and Islamic Cairo", description: "Coppersmiths, mosques of Al-Muizz Street, and mint tea at Fishawi's, the 18th-century café still open past midnight.", photo: "" },
      { title: "White Desert Overnight", description: "A 4x4 run from Bahariya Oasis to camp among chalk rock formations carved by wind, with fennec foxes circling at dusk.", photo: "" },
      { title: "Aswan and Philae Temple", description: "Felucca sailing past Elephantine Island, the Nubian village of Gharb Soheil, and Isis's temple reached by motorboat.", photo: "" },
      { title: "Abu Simbel at Dawn", description: "Ramses II's rock-cut colossi facing the rising sun across Lake Nasser, best photographed in the first hour after opening.", photo: "" },
    ],
  },
  "fiji-7-days": {
    hero: "",
    tagline: "Seven days across Fiji's outer islands, where the reef hisses against the boat hull at dawn and frangipani drops onto white sand. Slow mornings, long swims, kava at sunset.",
    longForm: `Fiji is 333 islands scattered across a stretch of South Pacific the size of a small country, and a week is just enough to pick a lane. Most luxury travelers fly into Nadi, transfer by seaplane or helicopter to a private island in the Mamanucas or Yasawas, and barely move again. That is the point. The pace here is set by the tide and the afternoon rain, not by a checklist.

Base yourself for three or four nights in the Mamanucas at somewhere like Vomo, Tokoriki, or Likuliku, where the reef starts ten meters off your deck. Days unfold around snorkel trips to Cloud 9, sunset paddleboards, and lunches of kokoda, the local ceviche cured in coconut cream and lime. From there, push north to the Yasawas for sea kayaking around Sawa-i-Lau or fly across to Vanua Levu, Fiji's quieter second island, for Savusavu's pearl farms and the dive sites of the Rainbow Reef.

If you want green over blue, swap a beach night for Taveuni. The Bouma National Heritage Park trails climb past three-tiered waterfalls, and the Waitabu Marine Park snorkel is run by the village itself. Couples often split the week 4-3 between a Mamanuca resort and a smaller Yasawa or Taveuni property to get both the polish and the wildness.

Travel May to October for dry, breezy weather and water clarity above 30 meters. Domestic flights on Pacific Island Air and Northern Air run on island time, so build a buffer day before international departures. Tip: bring reef-safe sunscreen (most resorts now require it) and a long-sleeve rash guard for full-day boat trips.`,
    themes: [
      { title: "Yasawa Islands Sailing", description: "Hop between Nanuya Lailai, Waya, and Sawa-i-Lau's limestone caves on a small catamaran or private charter.", photo: "" },
      { title: "Mamanuca Snorkel Drifts", description: "Float the soft coral gardens off Malolo and Monuriki, where reef sharks cruise beneath outrigger shadows.", photo: "" },
      { title: "Vomo and Turtle Island Stays", description: "Settle into an overwater villa or beachfront bure with a private chef and twice-daily reef access.", photo: "" },
      { title: "Taveuni Rainforest and Waterfalls", description: "Hike the Lavena Coastal Walk and swim under Tavoro Falls on Fiji's lush garden island.", photo: "" },
      { title: "Savusavu Hot Springs and Pearls", description: "Tour J. Hunter Pearl Farm by boat, then soak in the volcanic springs bubbling along Savusavu's main street.", photo: "" },
      { title: "Lovo Feast and Meke Night", description: "Eat slow-cooked pork and dalo pulled from an earth oven while villagers perform traditional spear and fan dances.", photo: "" },
    ],
  },
  "france-8-days": {
    hero: "",
    tagline: "Eight days in France means trading Paris zinc bars for Provençal lavender fields, with the smell of warm butter croissants trailing you between train stations. Expect long lunches and slower afternoons.",
    longForm: `France in eight days asks you to choose: stay in Paris and slow down, or pair the capital with one region south. Most travelers do better splitting the trip, with three or four nights in Paris and the rest in Provence or along the Mediterranean. The TGV makes this painless. You can finish a morning espresso at a Saint-Germain café and be eating bouillabaisse in Marseille by dinner.

Start in Paris with the obvious anchors, the Louvre, Notre-Dame's restored facade, the Eiffel Tower at dusk, but build in neighborhood time. Le Marais rewards aimless walking past Place des Vosges and into the Picasso Museum. Canal Saint-Martin pulls a younger crowd to natural wine bars like Le Verre Volé. Book one nice dinner: Septime if you plan months ahead, Clamato or Le Servan if you don't. For day trips, Versailles is the classic, but a Champagne run to Reims or Épernay often feels less crowded.

Heading south, Provence works well in summer for lavender (peak bloom is late June through mid-July) and Aix makes a good base for Gordes, the Sénanque Abbey, and the ochre paths of Roussillon. If you'd rather swap countryside for coast, Nice gives you socca, the Matisse Museum, and easy trains to Èze, Villefranche, and Antibes. Lyon is the food-focused alternative, all bouchons and Paul Bocuse market stalls.

Eat lunch as your big meal; many top kitchens offer prix-fixe menus at half the dinner price. Mid-range hotels run 180 to 280 euros in Paris, less in the regions. Avoid August in cities (locals leave, half the bistros close) and target May, June, or September.`,
    themes: [
      { title: "Paris: Le Marais and Canal Saint-Martin", description: "Wander cobbled rue des Rosiers for falafel at L'As du Fallafel, then drift north for natural wine along the canal.", photo: "" },
      { title: "Louvre and Musée d'Orsay", description: "Pair the Louvre's Denon wing with d'Orsay's Impressionist galleries; book timed entries to skip the morning queue.", photo: "" },
      { title: "Lyon Bouchons and Les Halles Paul Bocuse", description: "Eat quenelles de brochet and praline tarts in a wood-paneled bouchon, then graze the city's covered food market.", photo: "" },
      { title: "Provence: Aix-en-Provence and the Luberon", description: "Base in Aix for fountains and Cézanne's studio, then drive to Gordes, Roussillon's ochre cliffs, and Sénanque Abbey.", photo: "" },
      { title: "Côte d'Azur: Nice and Èze", description: "Walk the Promenade des Anglais, eat socca on Cours Saleya, and ride the corniche east to the cliffside village of Èze.", photo: "" },
      { title: "Champagne Day Trip from Paris", description: "Train to Reims for cellar tours at Taittinger or Ruinart, lunch at Brasserie Excelsior, and the Gothic cathedral.", photo: "" },
    ],
  },
  "greece-5-days": {
    hero: "",
    tagline: "Five days between marble ruins and white-cube villages, where the air smells like wild oregano and the Aegean turns the color of bottle glass at noon.",
    longForm: `Greece compresses three thousand years of history into a coastline that smells of salt, pine resin, and grilled lamb. Five days is enough to pair the mainland's monuments with one island, no more. The trick is choosing your second act early: Athens plus Santorini for drama, Athens plus Naxos for quieter beaches and better food, Athens plus Delphi if ruins are the real draw.

Start in Athens with two nights. The Acropolis deserves a sunrise visit before the cruise crowds arrive, followed by the new Acropolis Museum and a long lunch in Psyrri or Plaka. Set aside an afternoon for the Ancient Agora and the Stoa of Attalos, then climb Lycabettus Hill for the city laid out below. On day two, drive down to Cape Sounion for the Temple of Poseidon at sunset, or push further to Delphi for the day.

Days three through five belong to the islands. A 45-minute flight or eight-hour ferry brings you to Santorini, where Oia's caldera-edge hotels justify their price for one or two nights. Eat at Metaxi Mas in Exo Gonia, swim at Red Beach, and taste assyrtiko at a working winery. Naxos and Paros offer better swimming and half the crowds if Santorini feels overbuilt.

Mid-range travelers should budget 150 to 250 euros per night on the islands, less in Athens. May, June, and September are the sweet spots: warm sea, manageable heat, and restaurants still open. August is hot and packed. Rent a car on any island bigger than Mykonos. Cash still matters at smaller tavernas.`,
    themes: [
      { title: "Acropolis and Plaka Wandering", description: "Climb to the Parthenon at golden hour, then descend into Plaka's tavernas for grilled octopus and a carafe of retsina.", photo: "" },
      { title: "Santorini Caldera Sunsets", description: "Watch the sun drop behind the volcano from Oia's blue-domed rooftops, with assyrtiko wine from Santo Wines nearby.", photo: "" },
      { title: "Delphi Day Trip", description: "Drive three hours through olive groves to the Oracle's ruins on Mount Parnassus, where eagles still circle the Tholos.", photo: "" },
      { title: "Mykonos Beach Days", description: "Split time between the windmills of Chora and the calmer sands of Agios Sostis, away from the Paradise Beach crowds.", photo: "" },
      { title: "Cape Sounion at Dusk", description: "A 90-minute coastal drive ends at the Temple of Poseidon, perched on a cliff above the Saronic Gulf.", photo: "" },
      { title: "Naxos Mountain Villages", description: "Trade the coast for Apiranthos and Halki, marble-paved hamlets serving citron liqueur and slow-cooked goat.", photo: "" },
    ],
  },
  "hamburg-5-days": {
    hero: "",
    tagline: "Hamburg smells like harbor diesel and fresh fish rolls at dawn, then shifts after dark into the bass-thump of Reeperbahn basements. Five days here means red brick warehouses, canal ferries, and bars that don't bother closing.",
    longForm: `Hamburg sits on water and acts like it. Ferries cross the Elbe and the Alster all day, gulls argue over chip wrappers along the Landungsbrücken piers, and the smell of harbor diesel mixes with bakery sugar from the Franzbrötchen carts on every other corner. Five days gives you room to handle the city the way it wants to be handled: slow mornings, long lunches, late nights, and at least one Sunday that starts before sunrise at the Fischmarkt.

Base yourself somewhere central like the Neustadt or near the Hauptbahnhof, then radiate out. Spend a day on the harbor side, walking through Speicherstadt's brick canyons into HafenCity and up to the Elbphilharmonie's free public Plaza. Another day belongs to St. Pauli and Altona: thrift shops on Marktstrasse, a Portuguese lunch in the Portugiesenviertel, then sunset beers on the Elbe beach at Strandperle. Save a full evening for the Reeperbahn, but skip the obvious tourist bars and aim for Hamburger Berg, Silbersack, or the live music rooms at Molotow and Knust.

For food beyond the standard fish roll, try Pannfisch at Oberhafenkantine, labskaus at Old Commercial Room, and Vietnamese at the cluster of spots in Sternschanze. The Schanzenviertel and Karoviertel are where you find the real neighborhood Hamburg, with cafes spilling into courtyards and bookstores that double as bars.

Mid-range hotels run 120 to 180 euros a night; the U-Bahn and S-Bahn cover almost everything, and a HVV day pass is your friend. Visit May through September for harbor weather, but pack a rain shell regardless.`,
    themes: [
      { title: "Speicherstadt Warehouse District", description: "Wander the world's largest warehouse complex on foot, crossing iron bridges between red brick facades that glow copper at sunset.", photo: "" },
      { title: "Reeperbahn and Hamburger Berg", description: "St. Pauli's nightlife strip runs from kitschy Reeperbahn bars to the scruffier, cheaper Hamburger Berg side street favored by locals.", photo: "" },
      { title: "Fischmarkt Sunday Mornings", description: "Show up at Altona's harbor market by 6am for shouting fish vendors, live brass bands in the Fischauktionshalle, and eel sandwiches.", photo: "" },
      { title: "Karoviertel and Schanzenviertel", description: "Independent shops, Turkish bakeries, and graffiti-covered courtyards fill these two neighborhoods west of the center, best explored on a slow afternoon.", photo: "" },
      { title: "Elbphilharmonie and HafenCity", description: "Ride the curved escalator up to the public Plaza for a free 360 view, then walk the new harbor district's promenades.", photo: "" },
      { title: "Franzbrötchen and Labskaus", description: "Eat your way through Hamburg specialties: cinnamon-sugar Franzbrötchen pastries for breakfast, sailor's labskaus or Pannfisch for dinner.", photo: "" },
    ],
  },
  "ibiza-5-days": {
    hero: "",
    tagline: "Ibiza runs on two clocks: the slow one set by salt drying on your skin at Cala Comte, and the four-on-the-floor pulse that takes over after midnight. Five days is enough to learn both.",
    longForm: `The island has been a stage for outsiders since the Phoenicians ran salt off these flats, and it still works that way. Five days lets you split your time between the daytime island (pine forests, limestone coves, long lunches that drift into late afternoon) and the nighttime one, where the superclubs in Playa d'en Bossa pull in DJs who command stadiums everywhere else. A balanced pace matters here. Burn both ends and you miss the actual point, which is the in-between hours when the light goes pink over the salt pans of Ses Salines.

Base yourself near Ibiza Town for the first two nights to walk Dalt Vila at dusk, eat at La Gaia or Can Alfredo, and roll into Pacha or Hï without a long taxi back. Then move north. The road up to Sant Joan de Labritja and Portinatx winds through almond groves and reaches beaches like Cala Xarraca and Cala d'en Serra, where the crowds thin and the water turns that improbable green. Sunday belongs to Las Dalias market in San Carlos, followed by a long table at La Paloma. Save one afternoon for the southwest: a boat from Cala d'Hort out toward Es Vedrà, the limestone monolith that rises 400 meters straight from the sea.

Food is better than the island's reputation suggests. Look for bullit de peix (a two-course fish stew) at Es Boldado, sofrit pagès in the inland villages, and sobrasada with honey at any decent bar. For luxury stays, Six Senses on the north coast, Hacienda Na Xamena above Cala Xarraca, and Nobu in Talamanca are the strongest options.

Go in late May, June, or September. July and August work but prices double and the roads clog. Rent a car. The island is small but the best coves sit at the end of dirt tracks the bus does not run.`,
    themes: [
      { title: "Pacha and Hï Ibiza Club Nights", description: "The big rooms in Playa d'en Bossa and Marina Ibiza run resident sets from Solomun, Black Coffee, and Anyma until sunrise.", photo: "" },
      { title: "Cala Comte and Cala Salada Beach Days", description: "West-coast coves with clear shallow water, smooth sandstone shelves, and beach clubs serving rosé until the sunset rush.", photo: "" },
      { title: "Dalt Vila Old Town", description: "The UNESCO-listed walled quarter above Ibiza Town, full of cobbled ramps, tapas bars, and 16th-century ramparts at golden hour.", photo: "" },
      { title: "Sant Joan and Es Vedrà North", description: "Quieter villages, the Sunday hippy market at Las Dalias, and clifftop views of the Es Vedrà rock from Cala d'Hort.", photo: "" },
      { title: "Long Lunches at Beach Clubs", description: "Full afternoons at Beachouse, Experimental Beach, or Amante on Sol d'en Serra, built around grilled fish and natural wine.", photo: "" },
      { title: "Sa Penya Seafood and Bullit de Peix", description: "Old fishermen's quarter dishes like bullit de peix, arroz a banda, and sobrasada at Es Boldado and La Brasa.", photo: "" },
    ],
  },
  "iceland-7-days": {
    hero: "",
    tagline: "Steam hisses off black lava fields while glaciers crack in the distance. Iceland packs waterfalls, puffins, and midnight sun into a country smaller than Kentucky, where the air smells faintly of sulfur and salt.",
    longForm: `Iceland is a country built on collision. The Mid-Atlantic Ridge runs straight through it, pulling the island apart by about two centimeters a year and venting that tension through geysers, fissure eruptions, and the steaming blue water of the Blue Lagoon. Seven days gives you enough time to circle the south coast, dip into the Snæfellsnes Peninsula, and still return to Reykjavík for a proper meal at Dill or a langoustine soup at the Sægreifinn harbor shack.

For luxury travelers, the lodging has caught up with the landscape. The Retreat at Blue Lagoon offers private thermal access and a subterranean spa carved into 800-year-old lava. Deplar Farm in the Troll Peninsula runs heli-skiing and salmon fishing from a former sheep station. Hotel Rangá, near Hella, keeps astronomers on staff for aurora wake-up calls between September and April.

The driving is the trip. Route 1 strings together Seljalandsfoss (you can walk behind it), Skógafoss, the Reynisfjara basalt columns, and the glacier tongues of Vatnajökull. North of the ring road, Mývatn's pseudocraters and the Hverir mud pots feel genuinely alien. Photographers chase Kirkjufell at every hour, but the Westfjords reward anyone willing to add ferry time.

Eat lamb that grazed on wild thyme. Try fermented shark if you must, or skip it for fresh arctic char and rye bread baked in geothermal sand at Laugarvatn Fontana. The summer light barely fades. The winter dark delivers auroras. Pick your season carefully.`,
    themes: [
      { title: "Jökulsárlón Glacier Lagoon and Diamond Beach", description: "Watch icebergs calve from Breiðamerkurjökull and drift to a black-sand beach where they wash up like polished jewels.", photo: "" },
      { title: "Reykjanes Peninsula Volcanic Hikes", description: "Trek the still-warm lava fields near Fagradalsfjall and Geldingadalir, where 2021 and 2023 eruptions reshaped the landscape.", photo: "" },
      { title: "Snæfellsnes Peninsula Coastal Drive", description: "Photograph Kirkjufell mountain at golden hour, then explore black pebble beaches at Djúpalónssandur and the Búðakirkja church.", photo: "" },
      { title: "Golden Circle: Geysir, Gullfoss, Þingvellir", description: "Hit Strokkur's eight-minute eruptions, the two-tier Gullfoss canyon, and the rift valley where North American and Eurasian plates split.", photo: "" },
      { title: "Vatnajökull Ice Caves and Glacier Walks", description: "Crampon across Europe's largest ice cap or descend into electric-blue caves carved fresh each winter beneath the glacier's surface.", photo: "" },
      { title: "Westfjords and Látrabjarg Bird Cliffs", description: "Drive switchbacks to Dynjandi waterfall and crouch beside puffins at Europe's westernmost cliff, 440 meters above the Atlantic.", photo: "" },
    ],
  },
  "india-10-days": {
    hero: "",
    tagline: "Ten days in India means choosing your India. Marigold smoke at dawn over the Ganges, the clatter of tiffin carriers on a Mumbai local, cardamom steam rising off a glass of cutting chai at a roadside stall.",
    longForm: `Ten days is not enough for India and every traveler knows it going in. The trick is picking a corridor and committing. The classic Golden Triangle plus a detour to Varanasi or Udaipur covers Mughal architecture, Rajput forts, Ganges ritual, and four distinct food cultures without forcing you onto more than a couple of overnight trains. Pace is the point here. You will move fast, sleep less than you planned, and come home with a camera roll you cannot edit down.

Start in Delhi for two days. Old Delhi by cycle rickshaw, Humayun's Tomb in late afternoon light, dinner at a dhaba in Pahar Ganj. Train or drive to Agra for the Taj at sunrise, then push on to Jaipur for Amber Fort, the City Palace, and block-printed textiles in Bapu Bazaar. From here the itinerary forks. Photographers and culture-first travelers should fly to Varanasi for two nights of ghats, sadhus, and the Ganga aarti. Travelers chasing softer light and slower meals should head to Udaipur instead for lake palaces and Mewari thalis. Close the loop in Mumbai with a day in Colaba, Elephanta Caves by ferry, and a long evening eating across Mohammed Ali Road.

Budget travel here is genuinely cheap once you accept Indian Railways sleeper class, government-run guesthouses, and thali joints where lunch costs under 200 rupees. Book trains on IRCTC two weeks ahead. October through March is the workable window; avoid May heat and July monsoon flooding in the north. Carry small bills, a power bank, and loose cotton. Tap water is not your friend.`,
    themes: [
      { title: "Old Delhi and Chandni Chowk Food Walk", description: "Eat your way through Paranthe Wali Gali, Karim's kebabs near Jama Masjid, and jalebi sizzling in ghee at dawn.", photo: "" },
      { title: "Taj Mahal at Sunrise from Agra", description: "Enter through the east gate before crowds arrive to catch the marble shifting from pink to white as light rises.", photo: "" },
      { title: "Jaipur's Pink City and Amber Fort", description: "Photograph Hawa Mahal's lattice windows at golden hour, then climb to Amber Fort for mirrored halls and elephant trails.", photo: "" },
      { title: "Varanasi Ghats and Ganga Aarti", description: "Hire a rowboat at Assi Ghat for sunrise, then return for the fire ceremony at Dashashwamedh after dark.", photo: "" },
      { title: "Udaipur Lake Pichola and City Palace", description: "Cross the lake by ferry to Jag Mandir, wander whitewashed havelis, and shoot reflections from rooftop cafes in the old town.", photo: "" },
      { title: "Mumbai Street Food and Kala Ghoda", description: "Vada pav at Ashok near Kirti College, bhel puri on Chowpatty Beach, and gallery hopping through the Kala Ghoda art district.", photo: "" },
    ],
  },
  "istanbul-10-days": {
    hero: "",
    tagline: "Ferry horns blast across the Bosphorus while gulls wheel over Eminönü, chasing the smell of grilled mackerel sandwiches. Ten days lets Istanbul unfold at its own tempo, between minarets, tea glasses, and the low rumble of the tram down Istiklal.",
    longForm: `Istanbul does not introduce itself gently. Step out of the tram at Sultanahmet and you are already standing between Hagia Sophia and the Blue Mosque, with the call to prayer rolling across the rooftops and a simit seller pushing his red cart through the crowd. Ten days is the right length here. It gives you time to handle the headline monuments without rushing, then cross the water, get lost in side streets, and start recognizing the same çaycı who brings tea to your favorite shopkeeper.

Spend the first stretch in the old city. Topkapı Palace deserves a full morning, especially the Harem and the treasury. The Basilica Cistern is best at opening time before tour groups arrive. Walk from there into the Grand Bazaar and the Spice Market, then up through the workshop lanes around Süleymaniye Mosque, where Sinan's masterpiece sits above terraces of cheap kebab houses popular with students. Save a day for Chora Mosque in Edirnekapı and the colored wooden houses of Balat and Fener along the Golden Horn.

Cross the Galata Bridge and the trip changes register. Karaköy and Galata mix specialty coffee with century-old baklava counters. Walk Istiklal Caddesi up to Taksim, detouring through Çukurcuma's antique shops and Cihangir's cat-filled cafés. Take a public ferry (not a tour boat) up the Bosphorus to Anadolu Kavağı, or shorter, hop to Kadıköy on the Asian side for lunch at Çiya Sofrası and a crawl through the fish market.

Stay in Karaköy or Cihangir for atmosphere, Sultanahmet for proximity to sights. Mid-range hotels run 80 to 150 USD. April, May, September, and October bring the best weather; July and August are hot and packed. Use the Istanbulkart for trams, ferries, and funiculars. Book Hagia Sophia mosque visits around prayer times, and never skip a fish sandwich at Eminönü.`,
    themes: [
      { title: "Sultanahmet's Byzantine and Ottoman Core", description: "Hagia Sophia, the Blue Mosque, Topkapı Palace, and the Basilica Cistern sit within a ten-minute walk of each other.", photo: "" },
      { title: "Grand Bazaar and Spice Market Trading Halls", description: "Kapalıçarşı's 4,000 shops and the Mısır Çarşısı pyramids of sumac, urfa biber, and Iranian saffron reward slow browsing.", photo: "" },
      { title: "Karaköy and Galata Eating", description: "Börek at Karaköy Güllüoğlu, baklava at Karaköy Lokantası, and tiny meyhanes pouring rakı under the Galata Tower.", photo: "" },
      { title: "Bosphorus Ferry to Kadıköy", description: "Cross to the Asian side for Çiya Sofrası's regional Anatolian dishes and the produce stalls along Güneşli Bahçe Sokak.", photo: "" },
      { title: "Chora Church and the Walls of Theodosius", description: "Kariye Mosque's 14th-century mosaics and the old land walls anchor a quieter day in Fatih and Balat.", photo: "" },
      { title: "Çukurcuma and Cihangir Antique Hunting", description: "Orhan Pamuk's Museum of Innocence sits among dealers selling Ottoman silver, Bakelite radios, and old Turkish film posters.", photo: "" },
    ],
  },
  "italy-10-days": {
    hero: "",
    tagline: "Ten days in Italy means choosing your obsessions: the smell of wood smoke drifting from a Neapolitan pizza oven, the chalky tang of Chianti at lunch, golden hour bouncing off travertine in Rome.",
    longForm: `Ten days is enough to taste Italy properly if you resist the urge to chase everything. Most travelers anchor in three cities and accept that Sicily, Puglia, and the Dolomites will wait for another trip. The classic loop runs Rome to Florence to Venice by train, with a southern detour to Naples or a Tuscan countryside break wedged in the middle. Trains are fast, punctual, and cheaper than you'd expect; a Frecciarossa from Rome to Florence takes 90 minutes.

Start in Rome with three nights. Walk the Forum at opening, eat carbonara in Testaccio, and queue early for the Vatican Museums or book a Friday night slot to skip the worst of it. From there, head north to Florence for two nights of Renaissance art and bistecca alla fiorentina at Trattoria Mario. Rent a car for a day trip through Chianti, stopping in Greve and Castellina for Sangiovese and pecorino. Photographers should plan a late afternoon in Val d'Orcia, where the light turns the wheat fields gold around 6pm in summer.

Cap the trip with Venice or swing south to Naples and the Amalfi Coast. Venice rewards early risers and late wanderers, when the day-trippers have gone and the canals go quiet. Naples is louder, grittier, and arguably the best food city in the country; pair it with Pompeii or a ferry to Capri.

Mid-range here means 150 to 250 euros a night for well-located three-star hotels or family-run guesthouses. Eat lunch as your big meal, drink the house wine, and avoid restaurants with photo menus near major sights. May, June, and September hit the sweet spot for weather and crowds.`,
    themes: [
      { title: "Rome's Centro Storico at Dawn", description: "Photograph the Pantheon and Piazza Navona before the crowds, then eat cacio e pepe near Campo de' Fiori.", photo: "" },
      { title: "Florence and the Uffizi", description: "Book timed entry for Botticelli and Caravaggio, then climb to Piazzale Michelangelo for the city at sunset.", photo: "" },
      { title: "Tuscan Hill Towns by Car", description: "Drive between San Gimignano, Montepulciano, and Pienza for pecorino tastings and cypress-lined roads.", photo: "" },
      { title: "Naples Pizza and Pompeii", description: "Eat at Da Michele or Sorbillo, then take the Circumvesuviana train to walk Pompeii's stone streets before noon heat.", photo: "" },
      { title: "Venice Beyond San Marco", description: "Get lost in Cannaregio and Dorsoduro, shoot reflections at Squero di San Trovaso, eat cicchetti at All'Arco.", photo: "" },
      { title: "Amalfi Coast Drive", description: "Hire a driver from Sorrento to Positano and Ravello for lemon groves, ceramic shops, and Tyrrhenian views.", photo: "" },
    ],
  },
  "jordan-6-days": {
    hero: "",
    tagline: "Six days in Jordan moves between sandstone canyons and Roman colonnades, with cardamom coffee poured strong at every stop. The desert here hums at dusk, then goes silent enough to hear your own footsteps on Wadi Rum's iron-red sand.",
    longForm: `Jordan compresses neatly into six days because the country itself is small, roughly the size of Indiana, with the King's Highway threading most of what you came to see. The drive from Amman to Petra runs about three hours; Petra to Wadi Rum, another two. That geography lets you wake up in a Roman provincial capital, eat lunch beside a Crusader castle in Karak, and fall asleep in a goat-hair Bedouin tent the same night. A balanced pace means you can actually stop at Mount Nebo and the mosaic workshops in Madaba without sprinting.

Start in Amman, where the Citadel sits above downtown and the call to prayer ricochets between the seven hills around dusk. Hashem restaurant near the King Faisal mosque does the falafel and foul most locals swear by. From there, head north to Jerash for one morning of Roman ruins, or push south to Petra for two full days, the minimum to see both the Treasury at sunrise and the Monastery without rushing. Wadi Rum deserves an overnight: the silica sand around Lawrence's Spring photographs differently every hour, and the stars after dinner are the kind that ruin you for stargazing elsewhere.

Mid-range travelers can sleep well at Mövenpick Petra or any of the Wadi Musa boutique hotels, then upgrade to a luxury bubble camp like Memories Aicha in Wadi Rum for one splurge night. Mansaf, Jordan's national dish of lamb in fermented yogurt over rice, is worth ordering at Sufra in Amman. Best windows are March to May and September to November; July afternoons in the desert push past 40°C. Visa on arrival, or grab the Jordan Pass before you fly to bundle Petra entry.`,
    themes: [
      { title: "Petra's Siq and Monastery Trail", description: "Walk the narrow Siq at sunrise, then climb 800 steps past Bedouin tea stalls to reach Ad Deir.", photo: "" },
      { title: "Wadi Rum 4x4 and Bedouin Camp", description: "Cross the protected area by jeep to Khazali Canyon and Um Fruth arch, sleeping under Mars-like skies.", photo: "" },
      { title: "Jerash Roman Ruins", description: "Photograph the oval forum and Hadrian's Arch in low morning light, a 50-minute drive north of Amman.", photo: "" },
      { title: "Dead Sea Float at Ma'in", description: "Float in mineral water 430 meters below sea level, then rinse under hot waterfalls at Ma'in springs.", photo: "" },
      { title: "Amman's Rainbow Street and Citadel", description: "Eat knafeh at Habibah, browse Jara market on Fridays, then watch sunset from the Temple of Hercules.", photo: "" },
      { title: "Dana Biosphere Reserve Hike", description: "Trek the Wadi Dana trail through juniper and sandstone toward Feynan Ecolodge, spotting ibex along the way.", photo: "" },
    ],
  },
  "kyoto-7-days": {
    hero: "",
    tagline: "Seven slow days in Kyoto, where temple bells carry across tile rooftops at dawn and the smell of grilled mochi drifts out of Nishiki Market alleys. A city built for unhurried looking.",
    longForm: `Kyoto rewards patience. Seven days is enough to stop chasing checklists and start noticing things: the way moss creeps up a temple wall in Higashiyama, the rhythm of a tea whisk at a Daitoku-ji sub-temple, the late-afternoon light that turns the Kamogawa River silver. The city has more than 1,600 Buddhist temples and 400 Shinto shrines, and you will not see them all. The point is to pick a few neighborhoods and walk them properly.

Spend your first days east of the river. Higashiyama's lanes (Ninenzaka, Sannenzaka) lead up to Kiyomizu-dera, and the Philosopher's Path links Ginkaku-ji to Nanzen-ji through a corridor of cherry trees and small canal-side cafes. Devote a full morning to Fushimi Inari before the crowds, and a full day to Arashiyama on the western edge, where Tenryu-ji's borrowed-scenery garden and the Okochi Sanso villa anchor a quieter side of the city. Save an afternoon for northern Kyoto: Kinkaku-ji, then Ryoan-ji's rock garden, then a slow bus ride back through Murasakino.

Food deserves its own day. Start at Nishiki Market for tsukemono and grilled eel, work through tofu lunch at a Nanzen-ji yudofu house, and finish with one proper kaiseki dinner. Counter spots in Pontocho and Kiya-machi handle the casual end, with yakitori, oden, and obanzai sets under 4,000 yen.

Stay in a machiya rental in Nakagyo or a mid-range ryokan with breakfast included. The subway and bus network covers most of the city; rent a bike for flat neighborhoods. April and November book out a year ahead, so target late May, early June, or October for fewer crowds and good light.`,
    themes: [
      { title: "Fushimi Inari at Dawn", description: "Climb the vermilion torii tunnels before 7am, when the mountain paths empty out and fox shrines glow in low light.", photo: "" },
      { title: "Arashiyama Bamboo and Tenryu-ji", description: "Pair the bamboo grove with the Zen garden at Tenryu-ji, then cross Togetsukyo Bridge for soba lunch in Saga.", photo: "" },
      { title: "Gion and Pontocho After Dark", description: "Photograph wooden machiya facades along Hanamikoji, then eat yakitori in the lantern-lit alley of Pontocho.", photo: "" },
      { title: "Nishiki Market Tasting Walk", description: "Five blocks of pickle vendors, tako tamago, yuba, and tofu donuts that double as a primer on Kyoto cuisine.", photo: "" },
      { title: "Philosopher's Path Temple Loop", description: "Walk the canal from Ginkaku-ji to Nanzen-ji, stopping at Honen-in and Eikan-do for moss gardens and quiet halls.", photo: "" },
      { title: "Kaiseki and Kyo-ryori Dinners", description: "Book one multi-course kaiseki and one casual obanzai counter to taste Kyoto's tofu, yuba, and seasonal vegetable traditions.", photo: "" },
    ],
  },
  "maldives-5-days": {
    hero: "",
    tagline: "Five days where the loudest sound is a reef shark's tail flicking past your ladder. The Maldives runs on tide charts and sunset cocktails, with water so clear your shadow tracks you across the sand fifteen feet below.",
    longForm: `The Maldives is 1,200 islands strung across the equator, and only about 200 are inhabited. Roughly a third of those are single-resort islands, which means your five days here unfold on one patch of reef-fringed sand with a seaplane ride bookending the trip. This is not a country you tour. You pick an atoll, settle in, and let the days organize themselves around tide tables, dive schedules, and the angle of the sun.

Most luxury travelers base in the Baa Atoll or the North Malé Atoll. Baa is the move for marine life, particularly Hanifaru Bay during manta season, with Soneva Fushi and Four Seasons Landaa Giraavaru as the anchor properties. North Malé is closer to the airport and home to names like Four Seasons Kuda Huraa and One&Only Reethi Rah. Further north, Noonu Atoll holds Cheval Blanc Randheli and Velaa, both worth the longer transfer for the privacy. Further south, the Ari Atoll delivers reliable whale shark sightings year-round along its western edge. Photographers should plan around the blue hour: the lagoon water shifts from turquoise to mercury in about twenty minutes after sunset.

Days here move slowly on purpose. A morning snorkel off the house reef, lunch flown in from the resort's Japanese counter, an afternoon at the overwater spa, sunset on a dhoni with a thermos of cold karkadeh tea. Dinner might be on a sandbank, in an underwater dining room, or at a chef's table where the catch was speared that morning. Mas huni, the shredded tuna and coconut breakfast, is worth requesting even at properties that default to continental.

Practicalities: the dry season runs December to April, with calmer water and clearer visibility. May to November brings manta aggregations and lower rates. Seaplane transfers only operate in daylight, so afternoon arrivals into Velana International often mean an overnight in Malé. Pack reef-safe sunscreen; many resorts confiscate the rest at check-in.`,
    themes: [
      { title: "Overwater Villas in the Baa Atoll", description: "Private decks with glass floors and direct lagoon access, concentrated around UNESCO-protected Hanifaru Bay and Soneva Fushi.", photo: "" },
      { title: "Manta Ray Snorkeling at Hanifaru Bay", description: "From May to November, plankton blooms draw dozens of mantas and whale sharks into a single shallow cove.", photo: "" },
      { title: "Sandbank Picnics and Castaway Lunches", description: "Resorts ferry guests to bare crescents of sand for champagne lunches with no structures, no shade, no neighbors.", photo: "" },
      { title: "Sunset Dhoni Cruises", description: "Traditional wooden boats run dolphin-spotting circuits at golden hour through the South Malé Atoll channels.", photo: "" },
      { title: "Underwater Dining at Ithaa or 5.8", description: "Glass-tunnel restaurants serve tasting menus five meters below the surface while reef fish drift past the curved ceiling.", photo: "" },
      { title: "Bioluminescent Beaches of Vaadhoo", description: "On moonless nights, dinoflagellates light the shoreline blue with each breaking wave, peaking from July to February.", photo: "" },
    ],
  },
  "morocco-6-days": {
    hero: "",
    tagline: "Mint tea steams in tiny glasses while donkeys clatter through medina alleys narrower than your shoulders. Six days in Morocco moves between Atlantic wind, Atlas snow, and the hush of red dunes at dusk.",
    longForm: `Morocco compresses three continents of texture into a country the size of California. In six days you can move from the snow line of the High Atlas to Saharan dunes, from Atlantic fishing ports to medieval medinas where the call to prayer bounces off tile walls. A balanced pace means picking two or three anchors rather than chasing the whole map. Most trips start in Marrakech or Fes and loop south, since the desert is the experience that pulls hardest on a short itinerary.

Marrakech earns its reputation in Jemaa el-Fnaa after dark, when food stalls fire up and gnawa drummers compete with storytellers. Spend a morning in the Bahia Palace and the Saadian Tombs, then get properly lost in the souks around Rahba Kedima. From here, the classic three-day desert loop crosses the Tizi n'Tichka pass to Aït Benhaddou, overnights in the Dades or Todra gorges, and ends with a camel ride into Erg Chebbi at Merzouga. The drive is long but the landscape pays back every kilometer.

If your priorities lean cultural, swap the desert for Fes and Chefchaouen. Fes el-Bali is the most intact medieval city in the Arab world, and a guide is genuinely useful for the tanneries and the maze around Al-Qarawiyyin. Chefchaouen, four hours north, photographs best at 7 a.m. before the day-trippers arrive from Tangier.

Eat tagine, pastilla, and harira; the best meals are often at riads, the courtyard guesthouses that double as lodging in the 80 to 200 dollar range. Book a riad inside the medina walls for atmosphere, outside for parking. Skip July and August in the south (over 110°F) and aim for March to May or September to November. CTM and Supratours buses are reliable; for the desert loop, hire a driver.`,
    themes: [
      { title: "Marrakech's Jemaa el-Fnaa & Souks", description: "Snake charmers at sunset, orange juice carts, and the leather, spice, and lantern souks fanning out from the square.", photo: "" },
      { title: "Fes el-Bali Medina", description: "Walk the Chouara tanneries, the Al-Qarawiyyin library, and 9,000 alleys best navigated with a local guide.", photo: "" },
      { title: "Sahara Nights at Erg Chebbi", description: "Camel trek from Merzouga into the dunes, sleep in a Berber tent, photograph the Milky Way over the sand.", photo: "" },
      { title: "Atlas Mountains & Aït Benhaddou", description: "Drive the Tizi n'Tichka pass to the ksar where Gladiator filmed, with Berber village stops along the way.", photo: "" },
      { title: "Chefchaouen's Blue Streets", description: "The Rif Mountain town painted every shade of indigo, easiest to shoot in early morning before tour buses arrive.", photo: "" },
      { title: "Essaouira's Atlantic Coast", description: "Portuguese ramparts, gnawa music, grilled sardines at the port, and steady wind that keeps the medina cool.", photo: "" },
    ],
  },
  "nepal-12-days": {
    hero: "",
    tagline: "Twelve days where prayer flags snap above 4,000 meters and the smell of juniper smoke drifts through Kathmandu alleys at dawn. Nepal compresses jungle, medieval cities, and the Himalaya into one tight loop.",
    longForm: `Nepal at twelve days means choosing your altitude and committing. The country squeezes Tarai jungle, medieval brick cities, and eight of the world's fourteen highest peaks into a strip you can cross by bus in two long days. A fast itinerary usually runs Kathmandu to Pokhara to a shorter Annapurna trek, with a jungle detour south, and leaves you sunburned, sore-legged, and well fed on dal bhat.

Start in Kathmandu Valley. Spend two days on the Durbar Squares of Kathmandu, Patan, and Bhaktapur, where 17th-century pagodas lean over courtyards and metalworkers still hammer ritual bowls. Walk the kora at Boudhanath stupa around 5pm when butter lamps go up and Tibetan monks file past in maroon. From there, fly or take the tourist bus to Pokhara, the launch point for trekking. The Mardi Himal or Poon Hill circuits work in 4-5 days; Annapurna Base Camp needs at least seven. Teahouses run 500-800 NPR a night, with garlic soup and momos on every menu.

For contrast, drop south to Chitwan National Park for two nights of canoe trips and jeep safaris in the sal forest. Sauraha village has budget lodges under 2,000 NPR with breakfast included. Loop back through Bandipur for a quieter Newari evening before returning to Kathmandu.

October-November and March-April give the clearest mountain views; June-September is monsoon and leech season on trails. Buses are cheap but slow (Kathmandu to Pokhara is 7 hours minimum); the 25-minute flight costs around $120. Carry cash outside cities, and budget around $30-40 a day including trekking permits.`,
    themes: [
      { title: "Annapurna Base Camp Trek", description: "A 7-day push through rhododendron forest and Gurung villages to the glacial amphitheater at 4,130 meters.", photo: "" },
      { title: "Kathmandu's Durbar Squares", description: "Newari woodcarving, the Kumari's residence, and rooftop chiya stalls in Patan, Bhaktapur, and the old royal core.", photo: "" },
      { title: "Pokhara and Phewa Lake", description: "Paragliding off Sarangkot at sunrise, then sunset rowboats below the reflection of Machhapuchhre.", photo: "" },
      { title: "Chitwan Jungle Safari", description: "Jeep drives and dugout canoe trips tracking one-horned rhinos, gharials, and Bengal tigers in lowland sal forest.", photo: "" },
      { title: "Boudhanath and Pashupatinath", description: "Tibetan pilgrims circling the great stupa at dusk, and cremation ghats burning along the Bagmati River.", photo: "" },
      { title: "Bandipur Hilltop Village", description: "A car-free Newari bazaar town on the Kathmandu-Pokhara road, good for one slow night between bigger stops.", photo: "" },
    ],
  },
  "netherlands-5-days": {
    hero: "",
    tagline: "Five days of canal-side cafés, cheese markets, and the metallic clang of tram bells on wet cobblestones. The Netherlands packs Golden Age galleries, North Sea beaches, and late-night techno into a country smaller than West Virginia.",
    longForm: `The Netherlands runs on bikes, coffee, and the low gray light that flatters every brick gable. Five days gives you Amsterdam plus one or two side trips, which is the right shape for a country where intercity trains never run more than 90 minutes. Start in Amsterdam and don't bother with a car. Rent an omafiets from MacBike or Black Bikes, learn the hand signals, and join the river of commuters streaming over the Magere Brug at 8 a.m.

Spend the first two days in Amsterdam proper. The Rijksmuseum deserves a full morning for the Night Watch alone, and the Van Gogh Museum next door rewards a timed afternoon ticket. Wander the Jordaan for lunch at Winkel 43 (apple pie with whipped cream, the local benchmark) and book dinner at Restaurant Greetje for updated Dutch classics like hutspot and stewed rabbit. Nightlife splits between the canals and the south: jenever tastings at Wynand Fockink, jazz at Bimhuis, or techno at Shelter under Amsterdam Noord's A'DAM Tower.

Use day three or four for a side trip. Delft and The Hague pair well in one day by train, with the Mauritshuis holding Girl with a Pearl Earring and Scheveningen offering a windswept lunch of kibbeling and frites. Utrecht works as an alternative, calmer and student-heavy, with canal wharves built ten feet below street level. If tulips are blooming (mid-April to early May), Keukenhof is worth the bus ride from Schiphol.

Mid-range hotels run 180 to 280 euros in Amsterdam; consider Hotel V Nesplein or The Hoxton. Eat lunch from bakeries and cheese shops, save budget for one rijsttafel and one tasting menu. Trains use the OV-chipkaart or contactless tap. Visit April through September for terrace weather; November brings museum quiet and 4 p.m. sunsets.`,
    themes: [
      { title: "Rijksmuseum and Van Gogh Museum", description: "Two days of Vermeer, Rembrandt's Night Watch, and Van Gogh's bedroom paintings clustered around Amsterdam's Museumplein.", photo: "" },
      { title: "Jordaan Canal Belt by Bike", description: "Pedal the Prinsengracht and Brouwersgracht past houseboats, brown cafés, and the Anne Frank House on a rented omafiets.", photo: "" },
      { title: "Foodhallen and Indo-Dutch Rijsttafel", description: "Graze bitterballen and stroopwafels at Foodhallen, then sit down for a 15-dish rijsttafel at Tempo Doeloe or Blauw.", photo: "" },
      { title: "De Pijp Nightlife and Red Light District", description: "Start with jenever at Wynand Fockink, dance until dawn at Shelter or De School, end at a 24-hour herring cart.", photo: "" },
      { title: "Day Trip to Delft and The Hague", description: "Train 50 minutes south for Delftware pottery, Vermeer's View of Delft at the Mauritshuis, and Scheveningen beach bars.", photo: "" },
      { title: "Utrecht Wharves and Dom Tower", description: "Climb 465 steps up the Dom Tower, then eat lunch on the Oudegracht's split-level canal wharves, quieter than Amsterdam.", photo: "" },
    ],
  },
  "peru-10-days": {
    hero: "",
    tagline: "Ten days in Peru runs from Pacific surf to 12,000-foot Andean passes, with the smell of grilled anticuchos drifting through Lima's side streets and condors riding thermals over Colca Canyon at dawn.",
    longForm: `Peru in ten days is a workout. You start at sea level eating ceviche in Lima and finish gasping for air at 4,000 meters above Cusco, with stone ruins, snowmelt rivers, and a half-dozen microclimates in between. The pace is fast on purpose: this country rewards a tight loop more than a slow drift, and the classic circuit (Lima, Sacred Valley, Machu Picchu, optional Rainbow Mountain or Colca) genuinely fits inside a ten-day window if you fly the long legs.

Begin in Lima for two nights. Eat at a cevichería in Barranco, walk the Malecón above the surf, and visit the Larco Museum's pre-Columbian ceramics. Then fly to Cusco and head straight down to the Sacred Valley to acclimatize at lower elevation. Base in Urubamba or Ollantaytambo, hit Pisac's market, climb the terraces at Moray, and wade through the white maze of the Maras salt pans. Take the train from Ollantaytambo to Aguas Calientes for Machu Picchu at sunrise. Back in Cusco, give yourself two nights in San Blas to wander cobbled lanes, eat cuy or alpaca at Chicha, and tackle Rainbow Mountain or Humantay Lake as a long day trip.

Mid-range lodging runs $80 to $150 a night for boutique guesthouses in Cusco and the valley. Domestic flights on LATAM or Sky between Lima and Cusco are cheap and frequent. May through September is dry season and prime hiking weather; January and February bring heavy rain and Inca Trail closures. Carry soles in small bills, chew coca leaves for the altitude, and book Machu Picchu permits at least two months ahead.`,
    themes: [
      { title: "Inca Trail to Machu Picchu", description: "Four days across stone staircases and cloud forest, ending at the Sun Gate above the ruins at sunrise.", photo: "" },
      { title: "Sacred Valley and Ollantaytambo", description: "Terraced hillsides, Pisac's Sunday market, and the still-inhabited Inca town where stone fortresses rise behind adobe houses.", photo: "" },
      { title: "Cusco's San Blas Quarter", description: "Whitewashed artisan workshops, Quechua weavers, and Coricancha's gold temple foundations buried beneath colonial cloisters.", photo: "" },
      { title: "Rainbow Mountain and Ausangate", description: "A hard 5,200-meter day hike across mineral-streaked ridges, best done before 10 a.m. when clouds roll in.", photo: "" },
      { title: "Lima's Barranco and Miraflores", description: "Cliffside ceviche at La Mar, pisco sours in art-deco bars, and Pacific surf breaks below the Malecón.", photo: "" },
      { title: "Sacsayhuamán and Maras Salt Pans", description: "Cyclopean Inca masonry above Cusco and 3,000 terraced salt pools fed by an Andean spring since pre-Inca times.", photo: "" },
    ],
  },
  "petra-8-days": {
    hero: "",
    tagline: "Sandstone walls glow rose and ochre as you round the last bend of the Siq, and the Treasury appears in a hush of dust and donkey bells. Eight days lets Jordan unfold beyond the postcard.",
    longForm: `Petra alone takes two full days to walk properly, but the country around it is what makes eight days feel earned rather than rushed. You arrive in Amman, drop your bag in Jabal Amman or Jabal Weibdeh, and ease in with mezze at Sufra and a wander through the Roman Citadel above the city. By day three you are heading south on the Desert Highway or, better, the King's Highway past Madaba's mosaics and the crusader ruins at Karak, arriving in Wadi Musa by sunset.

Petra itself rewards a slow approach. Day one: the classic walk through the Siq to the Treasury, the Street of Facades, the Royal Tombs, and a climb to the High Place of Sacrifice for the view back down the wadi. Day two: enter via the Little Petra back trail with a local guide, descending to the Monastery from above before working your way out through the main valley. Bedouin families still run the tea stops along the climbs, and their goats know the staircases better than you do.

From Wadi Musa it is two hours south to Wadi Rum, where you swap stone for sand. A half-day 4x4 tour with a Zalabia driver covers Khazali Canyon, the Lawrence Spring, and Um Fruth rock bridge, and one night in a Bedouin camp is enough. Continue to Aqaba for a Red Sea swim and a flight or drive back to Amman.

November to March keeps daytime hikes comfortable; midsummer is brutal on the exposed trails. Mid-range travelers do well at Petra Moon Hotel or Movenpick at the gate, and a Jordan Pass bought before arrival covers the visa and most ruins. Bring real shoes, not sandals.`,
    themes: [
      { title: "The Siq and Al-Khazneh at Dawn", description: "Enter Petra before the tour buses to watch first light hit the Treasury facade carved by Nabataean stonemasons around 100 BCE.", photo: "" },
      { title: "Hike to the Monastery (Ad Deir)", description: "Climb 800 rock-cut steps past Bedouin tea stalls to reach Petra's largest monument, set high above the valley.", photo: "" },
      { title: "Wadi Rum Overnight in a Bedouin Camp", description: "Sleep under the Milky Way after a 4x4 run through Lawrence's desert, with mansaf cooked in a zarb pit.", photo: "" },
      { title: "Little Petra and the Back Trail", description: "Walk the six-hour route from Beidha through sandstone canyons into Petra from above, finishing at the Monastery.", photo: "" },
      { title: "Petra by Candlelight", description: "Twice weekly, 1,500 candles line the Siq for Bedouin music at the Treasury, slow and worth the late night.", photo: "" },
      { title: "Amman and Jerash Day", description: "Bookend the trip with downtown Amman's Citadel, knafeh at Habibah, and the Roman colonnades of Jerash an hour north.", photo: "" },
    ],
  },
  "phuket-5-days": {
    hero: "",
    tagline: "Longtail engines sputter across Patong Bay at sunrise while the smell of charcoal and lemongrass drifts from roadside grills. Five days here moves between sand, spice, and neon.",
    longForm: `Phuket is two islands stacked on top of each other. There is the postcard one, with curving bays and infinity pools cantilevered over the Andaman Sea, and there is the working one, where Sino-Portuguese shophouses peel in the humidity and motorbike vendors sell roti from folding carts after midnight. Five days gives you enough room to taste both without rushing, splitting time between a beach base on the west coast and at least one full day in Phuket Town.

Most travelers anchor in Kata or Karon for the swimmable water and walkable sois, then make the short ride to Patong for one big night out on Bangla Road. Days bend around the tide. Mornings are for snorkeling trips to the Similan or Phi Phi islands, afternoons for a Thai massage on the sand or a long lunch at Mom Tri's Kitchen above Kata Noi. Sunset belongs to Promthep Cape or the rooftop at Baba Nest in Nai Harn, where reservations are nonnegotiable.

Carve out one day for Phuket Old Town. Walk Thalang and Soi Romanee for coffee at Campus Coffee Roasters, lunch at Raya (the crab curry is the order), and souvenir hunting at Drawing Room gallery. Add a half day for Phang Nga Bay by speedboat, weaving between limestone stacks and stopping at Koh Panyee, the stilt village with a floating soccer pitch.

Mid-range hotels run 3,000 to 6,000 baht in high season (November through March). Skip taxi meters and use Bolt or Grab, or rent a scooter if you are confident. Pad thai at a street stall costs 80 baht; a cocktail at a beach club closer to 400. Bring reef-safe sunscreen and cash for the markets.`,
    themes: [
      { title: "Kata and Karon Beaches", description: "Softer sand and calmer water than Patong, with beach clubs like Re Ká Ta and shaded loungers under casuarina trees.", photo: "" },
      { title: "Bangla Road Nightlife", description: "Patong's neon corridor of go-go bars, Muay Thai rings, and rooftop spots like Kudo Beach Club for late dancing.", photo: "" },
      { title: "Phuket Old Town Food Walks", description: "Sino-Portuguese shophouses on Thalang Road serve Hokkien mee, moo hong, and o-tao at spots like Raya and Lock Tien.", photo: "" },
      { title: "Phang Nga Bay Day Trip", description: "Limestone karsts, sea caves, and James Bond Island reached by speedboat or longtail from Ao Po pier.", photo: "" },
      { title: "Big Buddha and Wat Chalong", description: "A 45-meter marble Buddha above Chalong Bay paired with Phuket's largest temple complex, best at golden hour.", photo: "" },
      { title: "Sunday Night Lard Yai Market", description: "Thalang Road closes to traffic for satay skewers, mango sticky rice, coconut ice cream, and live Thai pop on small stages.", photo: "" },
    ],
  },
  "portugal-7-days": {
    hero: "",
    tagline: "Portugal tastes like grilled sardines and salt air, with custard tarts still warm from the oven at Manteigaria. Seven days moves you from Lisbon's tiled hills to the Douro's terraced vineyards and the Algarve's ochre cliffs.",
    longForm: `Portugal runs along the Atlantic like a long balcony, and seven days is enough to walk most of it without rushing. The country reveals itself in small sensory details: the smell of charcoal sardines drifting out of Lisbon courtyards in June, the slap of dominoes in a Porto cafe, the chalky mineral finish of a young vinho verde. A balanced week typically splits between two cities, one wine region, and a stretch of coast, with train rides doing most of the connective work.

Start in Lisbon for two or three nights. Climb through Alfama at dusk when fado spills from doorways, ride tram 28 once for the view and never again for comfort, and eat your way through Time Out Market and the petiscos bars of Cais do Sodré. A day in Sintra adds Moorish ramparts and the candy-colored Pena Palace. From there, the train north to Porto takes about three hours and lands you in a city of azulejo-tiled churches, port lodges across the Douro in Vila Nova de Gaia, and tripe stews older than the country itself.

Build in at least one night in the Douro Valley, either at a working quinta near Pinhão or on the river itself. The terraced vineyards turn copper in autumn and emerald in spring. If you have a beach day to spare, fly south to Faro and base in Tavira or Lagos for cataplana, grilled dourada, and the limestone caves at Benagil.

Mid-range travelers do well in boutique hotels like Memmo Alfama or The Lodge in Gaia, with rooms typically 150 to 250 euros. Trains via CP are reliable and cheap. Go in May, June, or September to dodge August crowds and Algarve heat.`,
    themes: [
      { title: "Lisbon's Alfama and Bairro Alto", description: "Wander tiled lanes between fado houses and miradouros, with stops for ginjinha at A Ginjinha and pastéis de nata at Manteigaria.", photo: "" },
      { title: "Porto and the Ribeira Riverfront", description: "Cross the Dom Luís I bridge to taste vintage ports at Graham's and Taylor's, then eat francesinha in a tiled basement tasca.", photo: "" },
      { title: "Douro Valley Wine Country", description: "Take the train to Pinhão and tour quintas like Quinta do Bomfim, where steep schist terraces drop straight to the river.", photo: "" },
      { title: "Sintra Palaces and Forest", description: "A day trip to Pena Palace, Quinta da Regaleira's initiation well, and travesseiros pastries from Casa Piriquita.", photo: "" },
      { title: "Algarve Coast and Benagil Caves", description: "Kayak into the sea cave at Benagil, walk the Seven Hanging Valleys trail, and eat cataplana in Lagos or Tavira.", photo: "" },
      { title: "Bairro Alto and Time Out Market Dining", description: "Petiscos crawls through Cais do Sodré, oysters at Sea Me, and chef counters at Mercado da Ribeira.", photo: "" },
    ],
  },
  "prague-4-days": {
    hero: "",
    tagline: "Prague runs on cheap pilsner, cobblestone echoes, and the iron groan of trams climbing toward the castle. Four days here means Gothic spires by morning, goulash by afternoon, and basement jazz clubs that don't quit until 3am.",
    longForm: `Prague reveals itself in layers, and four days is enough to peel back several. The city survived the twentieth century with its medieval bones intact, which means the Charles Bridge you cross at sunrise looks roughly the same as it did when Mozart walked it. Start in Staré Město, where the Astronomical Clock still draws crowds every hour and the lanes around Týn Church twist toward beer cellars that have been pouring since the 1400s. The Czech koruna stretches further than the euro, and a proper sit-down dinner with two beers rarely breaks 400 CZK.

Cross the river on day two for Malá Strana and the climb to Prague Castle. St. Vitus Cathedral's rose window, the changing of the guard, and the doll-sized cottages of Golden Lane fill a morning. Spend the afternoon in Letná Park with a beer at the garden above the metronome, looking down at the bridges. Day three belongs to the neighborhoods locals actually live in: Žižkov for its absurd bar density and the Soviet-era TV Tower with crawling baby sculptures, or Vinohrady for cafés and Riegrovy Sady's hillside beer garden.

Save day four for Vyšehrad, the quieter fortress south of center, then the Jewish Quarter's six surviving synagogues and the layered headstones of the Old Jewish Cemetery. The Kafka Museum sits nearby if you want context for the city's stranger moods.

Eat svíčková, trdelník if you must, and chlebíčky from Sisters Bistro. Stay in Vinohrady or Holešovice for budget hostels and apartments under $40. Trams and the metro cover everything; skip taxis. Late spring and early autumn dodge both summer crowds and the January freeze.`,
    themes: [
      { title: "Old Town Square and Astronomical Clock", description: "Watch the Orloj's apostles parade on the hour, then escape the crowds into Týn Church's shadowed Gothic interior.", photo: "" },
      { title: "Prague Castle and Golden Lane", description: "Walk the largest ancient castle complex in the world, with St. Vitus Cathedral's stained glass and Kafka's tiny blue house at No. 22.", photo: "" },
      { title: "Žižkov Pub Crawl", description: "The city's most bar-dense district, where neighborhood hospodas pour Kozel for under 50 koruna and locals outnumber tourists.", photo: "" },
      { title: "Beer Halls and Czech Classics", description: "Pork knuckle at U Medvídků, svíčková at Lokál Dlouhááá, and fried cheese from a Wenceslas Square window at 2am.", photo: "" },
      { title: "Vyšehrad Fortress", description: "The other castle, perched above the Vltava with Smetana's grave, fewer crowds, and Cubist houses on the walk down.", photo: "" },
      { title: "Jazz Cellars and Cross Club", description: "Catch live sets at AghaRTA or Reduta, then end the night at Cross Club's industrial sculpture-bar in Holešovice.", photo: "" },
    ],
  },
  "reykjavik-4-days": {
    hero: "",
    tagline: "Reykjavik smells like sulfur and fresh sea air, often within the same block. Four days here splits neatly between a small capital of corrugated-iron houses and the volcanic country that starts twenty minutes past the city limits.",
    longForm: `Reykjavik is the world's northernmost capital and it feels like a fishing town that grew a music scene. The center is small enough to cross on foot in twenty minutes, all painted tin roofs and murals, with the Hallgrímskirkja steeple as your compass. Four days is the right amount of time: two for the city and its harbor, two for the volcanic country that begins almost immediately past the ring road.

Day one belongs to walking. Start at the Sun Voyager sculpture along the waterfront, cut up to Hallgrímskirkja for the elevator view, then work down Laugavegur and Skólavörðustígur stopping at Brauð & Co for cardamom buns and Reykjavik Roasters for coffee. Dinner at Matur og Drykkur or a langoustine soup at Sægreifinn covers the food brief. The next day, rent a car for the Golden Circle loop: Thingvellir National Park where the North American and Eurasian plates pull apart, the geyser at Strokkur that erupts every few minutes, and Gullfoss thundering into its canyon.

Day three goes south. Seljalandsfoss lets you walk behind the curtain of water, Skógafoss is loud and full of rainbows, and Reynisfjara's black sand and basalt sea stacks finish the run. Save day four for the Reykjanes peninsula, the recent eruption sites near Fagradalsfjall, and a long evening soak at Sky Lagoon watching the Atlantic.

Stay in 101 Reykjavik for walkability; Kex Hostel and Sand Hotel are reliable mid-range picks. Book the Blue Lagoon or Sky Lagoon in advance. May through September gives you long daylight and puffins; February brings aurora and ice caves but shorter, weather-dependent days.`,
    themes: [
      { title: "Golden Circle Day Loop", description: "Thingvellir's tectonic rift, Geysir's sulfur plumes, and Gullfoss falls fit into one rented-car day trip.", photo: "" },
      { title: "Reykjavik Food Hall & Bæjarins Beztu", description: "Hlemmur Mathöll for langoustine soup and the harbor-front hot dog stand Icelanders queue at after midnight.", photo: "" },
      { title: "Reykjanes Peninsula & Sky Lagoon", description: "Lava fields from the recent Fagradalsfjall eruptions, plus a clifftop geothermal pool with a seven-step ritual.", photo: "" },
      { title: "Hallgrímskirkja & Laugavegur Walking", description: "Climb the basalt-column church tower for rooftop views, then drift down Laugavegur for wool shops and bakeries.", photo: "" },
      { title: "South Coast Waterfalls & Black Sand", description: "Seljalandsfoss, Skógafoss, and Reynisfjara's basalt columns make a long but photogenic day from the city.", photo: "" },
      { title: "Whale Watching from Old Harbour", description: "Three-hour boats out to Faxaflói Bay for minke whales, puffins in summer, and the Esja mountain skyline.", photo: "" },
    ],
  },
  "sardinia-7-days": {
    hero: "",
    tagline: "Sardinia smells like juniper smoke and salt. Seven days here means slow lunches under fig trees, granite coves the color of swimming pool tile, and shepherds' roads that end at empty beaches.",
    longForm: `Sardinia is not a quick island. It is bigger than you expect, with two coasts, a granite spine, and interior villages where Italian sounds like a second language. Seven days gives you enough room to pick a base or two without spending the trip in the car. Most travelers split between the north (Olbia, Alghero, the Costa Smeralda) and the wilder east coast around the Golfo di Orosei. A balanced week looks like three nights up north, three nights east or south, and a buffer day for the beach you cannot leave.

Start with water. The La Maddalena archipelago is best seen by skippered gozzo from Palau or Cannigione; bring lunch and stop at Cala Corsara. Down the east coast, Cala Goloritzé requires a 90-minute hike from the Altopiano del Golgo, and the limestone arch at the end is worth every switchback. If you prefer pulling up to a beach by car, Chia and Tuerredda in the south have shallow water and a few good kiosks for fried calamari and vermentino.

Inland is where Sardinia gets strange and excellent. Drive into the Barbagia mountains for lunch at an agriturismo near Oliena: porceddu roasted over myrtle wood, sheep's milk ricotta, seadas drizzled with bitter honey. Mamoiada has the Museo delle Maschere if you want context on the island's pre-Christian carnival traditions. Closer to Cagliari, the nuraghe at Barumini is the best-preserved Bronze Age site in the Mediterranean.

May, June, and September are the sweet spots; July and August get crowded and pricey. Mid-range here means small hotels in Alghero's old town, a stazzo (converted shepherd's cottage) in Gallura, or family-run B&Bs in Cala Gonone, generally 120 to 200 euros a night. Rent a car at the airport. The roads are good, the signage is honest, and the best meals are always thirty minutes from the coast.`,
    themes: [
      { title: "Costa Smeralda and La Maddalena Archipelago", description: "Boat days around Spargi and Budelli, where the water turns a milky turquoise over white sand shelves.", photo: "" },
      { title: "Cala Goloritzé and the Golfo di Orosei", description: "Hike or take a gozzo from Cala Gonone to limestone coves like Cala Mariolu and Cala Luna.", photo: "" },
      { title: "Agriturismo dinners in Barbagia", description: "Long meals of suckling pig, pane carasau, and Cannonau wine at family farms near Oliena and Mamoiada.", photo: "" },
      { title: "Alghero's old town and Capo Caccia", description: "Catalan-tinged seafood lunches on Bastioni Marco Polo, then the 656 steps down to Neptune's Grotto.", photo: "" },
      { title: "Bosa and the western coast drive", description: "Pastel houses along the Temo River, Malvasia tastings, and the empty SP49 cliff road toward Alghero.", photo: "" },
      { title: "Su Nuraxi and inland archaeology", description: "The Bronze Age stone tower at Barumini, plus the wild horses of the Giara di Gesturi plateau nearby.", photo: "" },
    ],
  },
  "seychelles-6-days": {
    hero: "",
    tagline: "Granite boulders the color of warm toast tumble into water so clear it reads as glass. Six slow days in the Seychelles means coconut palms creaking overhead, fruit bats at dusk, and reef fish flickering inches from your snorkel mask.",
    longForm: `The Seychelles sit 1,000 miles off East Africa, a scatter of 115 islands where granite peaks rise straight out of the Indian Ocean and the light at sunset turns the boulders pink. Six days is enough to settle into the rhythm of three islands without rushing: Mahé for arrival and one good dinner, Praslin for forest walks and long beach days, La Digue for bicycles and the most photographed coastline in the country. The pace is deliberately slow. You are not ticking off cities. You are watching the tide change.

Mahé handles the logistics. Fly into Victoria, drive thirty minutes to a villa above Anse Takamaka or Petite Anse, and spend the first day swimming and adjusting. From there, a short Cat Cocos catamaran or a fifteen-minute Air Seychelles hop reaches Praslin, the second-largest island. The Vallée de Mai protects an ancient palm forest that feels prehistoric, and Anse Lazio routinely lands on global beach lists for good reason. La Digue is a quick ferry across: rent a bike, ride the coast road past Anse Source d'Argent, and stop for fresh-grilled fish at a beach shack near Grand Anse.

Photographers do well here in the soft hours. Early morning light hits the granite at Anse Patates; late afternoon turns the water at Anse Cocos into a pale jade. Bring a polarizer and waterproof housing if you have one.

Luxury lodging anchors the trip. Six Senses Zil Pasyon on Félicité, Four Seasons Desroches, and Constance Lémuria on Praslin are the standard picks, with North Island for serious splurges. Eat Creole: octopus curry, ladob, smoked fish salad, and palm-heart millionaire's salad. Go between May and September for drier weather and steadier trade winds.`,
    themes: [
      { title: "Anse Source d'Argent, La Digue", description: "Photograph the archipelago's most famous beach at low tide, when shallow lagoons mirror the sculpted granite formations.", photo: "" },
      { title: "Vallée de Mai, Praslin", description: "Walk the UNESCO palm forest where coco de mer trees grow the largest seed on earth and black parrots call overhead.", photo: "" },
      { title: "Anse Lazio and Anse Georgette", description: "Spend unhurried afternoons on Praslin's two signature beaches, swimming between takamaka trees and pale coral sand.", photo: "" },
      { title: "North Island and Frégate Lodges", description: "Base on a private-island resort where giant Aldabra tortoises wander the lawns and villas open straight onto the sand.", photo: "" },
      { title: "Sainte Anne Marine Park snorkeling", description: "Boat from Mahé into protected reefs to drift alongside hawksbill turtles, parrotfish, and the occasional reef shark.", photo: "" },
      { title: "Creole tables at Marie Antoinette", description: "Sit down to grilled job fish, octopus curry, breadfruit chips, and chili-spiked chatini in a colonial-era plantation house.", photo: "" },
    ],
  },
  "singapore-5-days": {
    hero: "",
    tagline: "Five days in Singapore means hawker centers humming under fluorescent lights, the wet-leaf smell of rain on Supertree Grove, and laksa eaten before 10am. The city runs on humidity and precision in equal measure.",
    longForm: `Singapore is small enough to cross in an hour and dense enough to keep you busy for a week. Five days hits the sweet spot: time to eat your way through three or four hawker centers, see the headline architecture, and still find a quiet morning under rain trees in the Botanic Gardens. The city rewards a balanced pace because the heat does not. Locals plan around it, ducking into air-conditioned MRT stations and shaded five-foot-ways between bursts of outdoor walking.

Start in the colonial core around Marina Bay, where the Merlion, the National Gallery, and the louvered facade of the ArtScience Museum sit within a 20-minute walk. From there the city splinters into distinct neighborhoods worth a half-day each. Chinatown for bak kut teh and the Buddha Tooth Relic Temple. Kampong Glam for Malay-Arab heritage, perfume oils on Arab Street, and Sultan Mosque's golden dome. Little India for Tekka Centre's wet market upstairs and dosa downstairs. Katong and Joo Chiat, further east, hold the Peranakan shophouses and the original katong laksa rivalry between 328 and Marine Parade Laksa.

Nature is closer than visitors expect. The Botanic Gardens sit a short MRT ride from Orchard Road, and MacRitchie Reservoir's TreeTop Walk delivers a genuine rainforest canopy in 90 minutes. Pulau Ubin, reached by bumboat from Changi Point, gives you an afternoon of village Singapore with hornbills and old kampong houses.

Stay in Tanjong Pagar or Tiong Bahru for mid-range comfort and walkable food. Budget around SGD 200-300 a night for a solid hotel. Visit February through April for the driest stretch; pack an umbrella regardless. The MRT and EZ-Link card cover almost everything, and Grab fills the gaps after midnight.`,
    themes: [
      { title: "Maxwell and Tiong Bahru Hawker Centers", description: "Queue for Tian Tian chicken rice, then cross town for chwee kueh and kaya toast at Tiong Bahru Market.", photo: "" },
      { title: "Gardens by the Bay and MacRitchie Reservoir", description: "Pair the Cloud Forest dome with a morning walk on the MacRitchie TreeTop boardwalk to spot long-tailed macaques.", photo: "" },
      { title: "Kampong Glam and Little India", description: "Wander Haji Lane's textile shops and eat banana leaf thali on Race Course Road before sunset prayers at Sultan Mosque.", photo: "" },
      { title: "Peranakan Katong", description: "Photograph the pastel shophouses on Koon Seng Road and order katong laksa with a short spoon, no chopsticks.", photo: "" },
      { title: "Marina Bay and the Civic District", description: "Cross the Helix Bridge at dusk, then catch the Spectra light show from the ArtScience Museum waterfront.", photo: "" },
      { title: "Singapore Botanic Gardens and Dempsey Hill", description: "Spend a slow morning in the National Orchid Garden, then lunch at the converted army barracks of Dempsey.", photo: "" },
    ],
  },
  "south-africa-10-days": {
    hero: "",
    tagline: "Ten days where the air smells like fynbos one morning and woodsmoke from a Kruger bushveld camp the next. South Africa stretches from cold Atlantic kelp forests to red Kalahari sand, with wine and braai smoke in between.",
    longForm: `South Africa works as a contrast machine. In ten days you can stand on Table Mountain at sunrise with the wind pushing clouds over the cable car, and three days later watch a lion walk past your Land Cruiser in low-slung Mopane scrub. The country rewards a loose plan and a rental car, with good roads connecting Cape Town, the Garden Route, and Johannesburg's gateway to Kruger. A balanced pace means two stops, not five.

Start in Cape Town. Give it three nights so you can climb Lion's Head before breakfast, eat snoek and slap chips at Kalk Bay harbour, and spend an afternoon in the Bo-Kaap learning where Cape Malay cooking actually came from. Day-trip to Stellenbosch or Franschhoek for wine. Then drive the N2 east along the Garden Route, stopping in Hermanus for southern right whales (in season), Wilderness for forest hikes, and Tsitsikamma for the suspension bridges over Storms River.

Fly from Port Elizabeth or George up to Johannesburg, then connect to Hoedspruit or Skukuza for Kruger. Three or four nights in a private reserve like Sabi Sand buys you off-road tracking and walking safaris that the main park does not allow. If you have an extra day, the Panorama Route to Blyde River Canyon is worth the detour.

Mid-range here goes far. Expect to pay around R1,500–3,500 per night for solid lodges, more inside private reserves. Eat at Test Kitchen alumni spots in Cape Town, order a Gatsby in Athlone, and try kudu at any decent steakhouse. Visit between April and October for dry weather and better game viewing. Self-drive is fine; just avoid Joburg after dark and keep some rand cash for tips and tolls.`,
    themes: [
      { title: "Kruger National Park Safari", description: "Track the Big Five on dawn game drives through Sabi Sand and Timbavati, where leopards drape across marula branches at dusk.", photo: "" },
      { title: "Cape Peninsula and Table Mountain", description: "Hike Platteklip Gorge, then drive to Cape Point past Chapman's Peak and the penguin colony at Boulders Beach.", photo: "" },
      { title: "Cape Winelands: Stellenbosch and Franschhoek", description: "Taste Chenin Blanc and Pinotage in oak-shaded estates, with long lunches at Babel and the Franschhoek wine tram.", photo: "" },
      { title: "Garden Route and Tsitsikamma", description: "Bungee from Bloukrans Bridge, kayak the Storms River mouth, and spot whales off Hermanus between June and November.", photo: "" },
      { title: "Bo-Kaap and Cape Malay Cooking", description: "Walk the painted streets above Cape Town and learn to fold samoosas and bobotie with families on Wale Street.", photo: "" },
      { title: "Drakensberg and Panorama Route", description: "Drive Blyde River Canyon's Three Rondavels and God's Window, then hike the amphitheatre cliffs in the northern Berg.", photo: "" },
    ],
  },
  "spain-8-days": {
    hero: "",
    tagline: "Eight days of late dinners, tiled patios, and the metallic tang of vermouth on tap. Spain runs on its own clock, and once you sync to it, the country opens up.",
    longForm: `Spain doesn't reward early risers. Lunch happens at 2, dinner at 10, and the best conversations start somewhere around midnight on a plaza you didn't plan to find. Eight days gives you enough room to hit two or three cities without sprinting, and the AVE high-speed train makes the math work: Madrid to Seville in 2.5 hours, Madrid to Barcelona in under three. Build the trip around long meals and longer evenings, and the country reveals itself between courses.

Start in Madrid for the museums (Prado, Reina Sofía, Thyssen) and the tapas density of La Latina and Lavapiés. From there, swing south to Seville and Granada for Andalusian heat, Mudéjar tilework, and flamenco that actually means something. Or head northeast to Barcelona for Gaudí, the seafood at La Boqueria, and the bar scene in El Born and Gràcia. Adventurous eaters should carve out two nights for San Sebastián, where pintxos bars line the Parte Vieja and the txuleta steaks at Casa Urola justify the detour.

Each region cooks differently. Castilla means roast lamb and cocido madrileño. Andalusia leans on gazpacho, jamón ibérico, and fried fish. Catalonia pulls from the sea (suquet, fideuà) and the mountains (botifarra, escalivada). Order the house vermouth before lunch. It's a ritual, not a drink.

For mid-range lodging, look at boutique hotels in central neighborhoods: Barrio de las Letras in Madrid, Born in Barcelona, Santa Cruz in Seville. Shoulder seasons (April-May, September-October) deliver the best weather without August's furnace heat or shuttered restaurants. Reserve the Alhambra and Sagrada Família weeks ahead. Everything else, you can figure out over a glass of wine.`,
    themes: [
      { title: "Madrid's La Latina Tapas Crawl", description: "Sunday afternoon at Cava Baja means standing-room bars, gildas on toothpicks, and cañas pulled in quick succession.", photo: "" },
      { title: "Barcelona's Gaudí Circuit", description: "Sagrada Família, Park Güell, and Casa Batlló trace Gaudí's strange geometry across the Eixample and Gràcia neighborhoods.", photo: "" },
      { title: "Seville Flamenco at Casa de la Memoria", description: "Intimate tablao shows in a converted convent courtyard, where guitar and heel-stomping land harder than any tourist spectacle.", photo: "" },
      { title: "San Sebastián Pintxos in Parte Vieja", description: "Bar-hop the old town for txuleta, gilda, and bacalao, washing it down with txakoli poured from arm's length.", photo: "" },
      { title: "Granada and the Alhambra", description: "Nasrid Palaces at sunset, then teterías in the Albaicín for mint tea and views across to the Sierra Nevada.", photo: "" },
      { title: "Madrid Nightlife in Malasaña", description: "Rooftop cocktails at Hotel Indigo, late sets at Café Berlín, and 3 a.m. churros at San Ginés.", photo: "" },
    ],
  },
  "switzerland-6-days": {
    hero: "",
    tagline: "Cowbells clang across alpine meadows while glacier water roars under stone bridges. Six days in Switzerland means trading altitude for altitude, with cogwheel trains hauling you up to thin, pine-scented air and lake ferries delivering you back down by dusk.",
    longForm: `Switzerland in six days asks you to move vertically more than horizontally. The country is small enough to cross by train in an afternoon, but the real distance is upward, from lakeside promenades at 400 meters to glacier saddles above 3,000. Plan a route that loops through the Bernese Oberland and the Valais, with one slow rail day stitching the regions together. Luxury here means private transfers from Zurich Airport, a suite at a grande dame like Victoria-Jungfrau in Interlaken or Mont Cervin Palace in Zermatt, and helicopter time over the Aletsch if weather cooperates.

Base yourself first in the Lauterbrunnen area for two nights. Take the cogwheel train through Kleine Scheidegg to Jungfraujoch, then spend a slower morning paragliding off Beatenberg or hiking the Eiger Trail beneath the north face. The light at 6 a.m. on the Schilthorn is worth the early alarm; Piz Gloria's revolving terrace puts the entire Bernese range in one frame.

Shift south to Zermatt by Glacier Express, reserving Excellence Class for the welcome drink and the larger windows. Three nights in the car-free village give you time for the Five Lakes hike, a sunrise run up to Gornergrat, and a long lunch at Chez Vrony in Findeln, where the rösti arrives with a wedge of Cervelat and the Matterhorn fills the deck. Save an afternoon for the Klein Matterhorn cable car to ski or simply walk on summer snow at 3,883 meters.

Eat fondue moitié-moitié in Gruyères if you transit through, drink Heida wine from Visperterminen, and book mountain restaurants at least a week ahead in July and August. June and September deliver the cleanest air for photography. Trains run on the minute, so build tight connections with confidence and carry a Swiss Travel Pass for the lifts it covers.`,
    themes: [
      { title: "Jungfraujoch and the Lauterbrunnen Valley", description: "Ride the Jungfrau Railway to 3,454 meters, then descend to a valley floor lined with 72 waterfalls.", photo: "" },
      { title: "Hiking the Five Lakes Trail above Zermatt", description: "A 9.8 km loop circling Stellisee, Grindjisee and three more pools that mirror the Matterhorn on still mornings.", photo: "" },
      { title: "Glacier Express, St. Moritz to Zermatt", description: "Eight hours through the Oberalp Pass and Landwasser Viaduct in panoramic carriages built for slow looking.", photo: "" },
      { title: "Lake Lucerne and Mount Pilatus", description: "Paddle steamer across the lake, then the world's steepest cogwheel railway up to ridge-top photo platforms.", photo: "" },
      { title: "Aletsch Glacier viewpoints from Bettmeralp", description: "Cable car to a car-free village above Europe's longest glacier, with hiking trails along the moraine edge.", photo: "" },
      { title: "Chasing the Matterhorn from Gornergrat", description: "Sunrise train to 3,089 meters for the cleanest sightline to the peak, ibex grazing near the observatory.", photo: "" },
    ],
  },
  "thailand-8-days": {
    hero: "",
    tagline: "Eight days from Bangkok's chili-smoke night markets to the limestone bays of the Andaman, with green curry simmering on every corner and tuk-tuk horns bleeding into temple bells at dusk.",
    longForm: `Thailand at eight days means picking your lanes carefully. The country sprawls from the dense lowland heat of the central plains to the karst-studded south, and a balanced trip typically threads three nights in Bangkok, two up in Chiang Mai, and three on an island or beach in the south. That cadence gives you city food crawls, a cooking class or temple morning in the north, and enough sand time to actually unwind before the flight home.

Bangkok rewards late nights. Start with boat noodles at Victory Monument, then walk Yaowarat after 7 p.m. when the woks come out and Nai Mong Hoi Thod's oyster omelets hit the griddle. Rooftop bars at Lebua and Vertigo handle the cocktail hour; Sukhumvit Soi 11 and Thonglor cover the after-midnight stretch. Fly an hour north and Chiang Mai shifts the tempo down. The Old City's grid of moated lanes holds Wat Chedi Luang, khao soi at Khao Soi Khun Yai, and a cooking school scene that runs day classes in the Mae Rim valley.

For the beach leg, choose your texture. Krabi and Railay deliver dramatic limestone and longtail-boat day trips to Phi Phi and Hong Island. Ko Samui pairs easier flights with quieter coves at Choeng Mon. Ko Phangan, a short ferry away, leans younger and louder, especially around full moon dates at Haad Rin.

Mid-range budgets stretch far here. Expect $60 to $120 a night for solid boutique hotels, $3 to $8 plates at street stalls, and cheap domestic flights on Thai Smile or AirAsia between regions. November through February brings dry, cooler weather; April's Songkran water festival is chaos in the best way. Book ferries a day ahead in high season.`,
    themes: [
      { title: "Bangkok's Yaowarat Street Food", description: "Chinatown's Yaowarat Road fires up after sundown with charcoal grills, oyster omelets at Nai Mong Hoi Thod, and mango sticky rice.", photo: "" },
      { title: "Khao San and Soi 11 Nightlife", description: "Backpacker bar crawls on Khao San Road, rooftop cocktails at Vertigo, and late DJ sets along Sukhumvit Soi 11.", photo: "" },
      { title: "Phi Phi and Krabi Island Hopping", description: "Longtail boats to Maya Bay, snorkeling at Bamboo Island, and limestone cliffs rising straight out of Railay Beach.", photo: "" },
      { title: "Old City Chiang Mai", description: "Sunday Walking Street market, Wat Phra Singh's gold chedis, and khao soi noodle shops tucked behind the moat.", photo: "" },
      { title: "Ko Phangan Beach Days", description: "Hammock afternoons at Haad Salad, sunset swims at Secret Beach, and full moon parties when the calendar lines up.", photo: "" },
      { title: "Thai Cooking Class in Chiang Mai", description: "Morning markets for galangal and kaffir lime, then pounding curry pastes by mortar at farms in Mae Rim.", photo: "" },
    ],
  },
  "turkey-8-days": {
    hero: "",
    tagline: "Eight days threaded between two continents, where the call to prayer drifts over Bosphorus ferries and apple tea steams in tulip-shaped glasses. Turkey rewards the camera and the curious in equal measure.",
    longForm: `Istanbul greets you with overlapping sounds: gulls over the Golden Horn, the muezzin's call bouncing off Sultanahmet's domes, a simit cart's wheels on cobblestone. Eight days is enough to pair this two-continent capital with one long-haul region beyond it, and most travelers split their time between Istanbul, Cappadocia, and a sweep of the Aegean coast. The pace works best as roughly three nights in the city, two in the rock country, and three along the western ruins.

Start in Sultanahmet for Hagia Sophia and Topkapı, then cross the Galata Bridge into Karaköy and Beyoğlu, where the antique shops of Çukurcuma sit above meyhanes pouring rakı by the carafe. A short flight to Kayseri puts you in Cappadocia by evening. Stay in a cave hotel in Göreme or Uçhisar, book the balloon ride for your first clear morning (weather cancels often), and spend the second day hiking the Rose and Red Valleys or descending into Derinkuyu's underground city.

From Cappadocia, fly to İzmir for the Aegean leg. Ephesus deserves a half day with a guide, ideally early before the cruise crowds arrive from Kuşadası. Pair it with the hilltop village of Şirince for wine, then push south to Pamukkale's travertines and the ruins of Hierapolis stacked above them. Photographers should plan for the last hour of light here.

Mid-range budgets stretch well: cave hotels run 80 to 150 dollars, domestic flights on Pegasus or Turkish Airlines stay under 60 dollars one-way, and a full kebab dinner with drinks rarely tops 25. Visit April to early June or September to October. July heat in Pamukkale and Ephesus is genuinely punishing, and winter grounds the balloons.`,
    themes: [
      { title: "Sultanahmet and the Grand Bazaar", description: "Hagia Sophia, the Blue Mosque, and 4,000 covered shops where carpet sellers still negotiate over tulip-glass tea.", photo: "" },
      { title: "Cappadocia Balloon Dawn", description: "Sunrise flights over Göreme's fairy chimneys, then afternoons exploring rock-cut churches in the Ihlara Valley.", photo: "" },
      { title: "Ephesus and the Library of Celsus", description: "Walking marble streets where Romans once shopped, with terrace houses still showing original mosaic floors.", photo: "" },
      { title: "Pamukkale Travertines", description: "Wading the chalk-white calcium pools above Hierapolis, best photographed in the low light just before dusk.", photo: "" },
      { title: "Karaköy and Galata Backstreets", description: "Third-wave coffee bars, Byzantine cisterns, and the Galata Tower stairwell view that locals try to keep quiet.", photo: "" },
      { title: "Antakya Mezze and Gaziantep Baklava", description: "Southern kitchens turning out muhammara, künefe with stretchy cheese, and pistachio baklava cut in 40 layers.", photo: "" },
    ],
  },
  "vietnam-10-days": {
    hero: "",
    tagline: "Ten days from the Red River Delta to the Mekong, with sidewalk plastic stools, the hiss of a bánh mì grill, and limestone karsts dissolving into morning haze over Ha Long Bay.",
    longForm: `Vietnam stretches 1,650 kilometers from the Chinese border to the Mekong, and ten days is enough to taste three of its distinct regions if you fly the long legs and travel slow on the ground. Most itineraries open in Hanoi, where motorbikes braid through the Old Quarter and grandmothers ladle phở from aluminum pots before sunrise. The trick on a budget trip is leaning into what is already cheap and excellent: street food, sleeper trains, and family-run guesthouses that often run under $25 a night.

From Hanoi, head east to Ha Long Bay or the quieter Lan Ha Bay off Cat Ba Island, where a two-day cruise with kayaking runs $90 to $150. Then fly south to Da Nang and base in Hoi An for a few nights. The Ancient Town glows under silk lanterns after dark, the beaches at An Bang are a ten-minute bike ride, and a day trip to Hue covers the Imperial Citadel and the tombs of Tu Duc and Khai Dinh. Eat cao lầu at Thanh in Hoi An and bún bò Huế anywhere a local queue forms.

For your final stretch, fly to Ho Chi Minh City. Spend a day on the War Remnants Museum and the Cu Chi Tunnels, another wandering District 1's bánh xèo joints and Bến Thành night market, then drop down to the Mekong Delta for a Can Tho homestay and the Cai Rang floating market at dawn.

Best months are October through April, when the north stays dry and the south sits in its cooler season. Grab the Reunification Express sleeper for one overnight leg, use Grab for taxis, and budget around $40 to $60 per day including a few splurge meals.`,
    themes: [
      { title: "Hanoi Old Quarter Street Food", description: "Eat your way through 36 streets: bún chả on Hàng Mành, egg coffee at Giảng, phở at Bát Đàn before 10am.", photo: "" },
      { title: "Ha Long Bay & Cat Ba Island", description: "Overnight junk boats, kayaking through Lan Ha Bay's quieter coves, and karst-climbing routes off Butterfly Valley.", photo: "" },
      { title: "Hoi An Lantern Town & Tailors", description: "Yellow walls in the Ancient Town, custom suits from Bebe or Yaly, and cao lầu noodles only made with local well water.", photo: "" },
      { title: "Hue Imperial Citadel & Royal Cuisine", description: "Walk the Nguyen Dynasty walls, then try bún bò Huế and bánh bèo at Madam Thu or the Đông Ba market stalls.", photo: "" },
      { title: "Mekong Delta Floating Markets", description: "Sunrise boats at Cai Rang near Can Tho, coconut candy workshops on Ben Tre, and homestays among rice paddies.", photo: "" },
      { title: "Sapa Rice Terraces Trekking", description: "Two-day hikes through Hmong and Dao villages around Lao Chai and Ta Van, sleeping in valley homestays below Fansipan.", photo: "" },
    ],
  },
  "zanzibar-6-days": {
    hero: "",
    tagline: "Cloves drying on rooftops, dhows tipping into the Indian Ocean, coral-stone alleys that smell like cardamom and sea salt. Zanzibar runs on monsoon time, and six days is enough to slow your pulse to match.",
    longForm: `Zanzibar smells like cloves before you see it. The archipelago sits forty kilometers off the Tanzanian coast, and its main island, Unguja, has been a crossroads for Omani sultans, Portuguese traders, Indian merchants, and Bantu farmers for a thousand years. Six days is the sweet spot here: enough time to pair two or three nights in Stone Town with a stretch on the coast, without rushing the heat of the afternoon, when most of the island goes quiet anyway.

Start in Stone Town. The UNESCO-listed old quarter is a maze of coral-rag walls, brass-studded doors, and shaded courtyards where men play bao under fig trees. Visit the Old Fort, the former slave market site at the Anglican Cathedral, and the Darajani spice market in the morning before the sun gets vertical. At dusk, Forodhani Gardens fills with grills cooking lobster skewers, mishkaki, and the local "Zanzibar pizza," a folded chapati stuffed with egg and minced beef.

For the beach half of the trip, pick a coast. Nungwi and Kendwa in the north have deep water at all tides and a livelier scene, with sunset cruises on traditional dhows and seafood shacks like Lukmaan's outpost on the sand. The southeast, around Paje and Jambiani, runs slower: tidal flats where women farm seaweed, kite schools, and barefoot beach bars. A half-day at Jozani Forest to see the red colobus and a spice farm tour near Kizimbani round out the inland experience.

Mid-range guesthouses run roughly $80 to $180 a night; book boutique riads like Emerson on Hurumzi in Stone Town and a beachfront bungalow on the coast. Eat at The Rock for the photo, but save your appetite for Lukmaan's biryani and home-cooked urojo. Best months are June through October (dry, breezy) and December through February. Avoid the long rains in April and May. Dress modestly in Stone Town; bikinis stay on the beach.`,
    themes: [
      { title: "Stone Town Alleys and Forodhani Gardens", description: "Wander Stone Town's carved doors and Omani forts, then graze night-market grills for Zanzibar pizza and sugarcane juice.", photo: "" },
      { title: "Nungwi and Kendwa Beaches", description: "The northern tip holds the island's calmest tides, powdery sand, and sunset dhow cruises off Kendwa's reef.", photo: "" },
      { title: "Jozani Forest and Red Colobus", description: "A morning walk through mahogany and mangrove boardwalks to spot the endemic Zanzibar red colobus monkey troops.", photo: "" },
      { title: "Spice Farm Tour in Kizimbani", description: "Pick cloves, nutmeg, and vanilla pods at a working farm, then eat a Swahili lunch cooked over open coals.", photo: "" },
      { title: "Paje and Jambiani Kitesurfing Coast", description: "The southeast coast trades rough surf for shallow turquoise lagoons, beach yoga, and seaweed-farming villages at low tide.", photo: "" },
      { title: "Swahili Cooking and Urojo Bowls", description: "Learn pilau, octopus curry, and tangy urojo soup in a home kitchen in Stone Town or a Jambiani guesthouse.", photo: "" },
    ],
  },
};

/* ─────────────── Public helpers ─────────────── */

function chipTheme(chip: string, region: Region | null): ThemeCard | null {
  const regional = region ? CHIP_THEMES_BY_REGION[chip]?.[region] : undefined;
  return regional ?? CHIP_THEMES[chip] ?? null;
}

export function getDestinationGuide(
  slug: string | undefined,
  fallbacks: {
    hero: string | null;
    tagline: string | null;
    chips: string[] | null;
    countryIso?: string | null;
  },
): DestinationGuide {
  const curated = slug ? DESTINATION_GUIDES[slug] : undefined;
  const region = regionForCountry(fallbacks.countryIso ?? null);
  const chips = fallbacks.chips ?? [];
  const FALLBACK_HERO = U("photo-1488646953014-85cb44e25828");

  // Build chip-based fallback themes (used both for fully uncurated destinations
  // and to fill in photos for curated entries that don't yet have them).
  const chipThemes: ThemeCard[] = [];
  const seenTitle = new Set<string>();
  const seenPhoto = new Set<string>();
  const tryPush = (t: ThemeCard | null) => {
    if (!t) return;
    const photoUrl = typeof t.photo === "string" ? t.photo : t.photo.url;
    if (seenTitle.has(t.title) || seenPhoto.has(photoUrl)) return;
    chipThemes.push(t);
    seenTitle.add(t.title);
    seenPhoto.add(photoUrl);
  };
  for (const chip of chips) tryPush(chipTheme(chip, region));
  for (const fallbackChip of ["Food", "Culture", "Nature", "City"]) {
    if (chipThemes.length >= 4) break;
    tryPush(chipTheme(fallbackChip, region));
  }

  if (curated) {
    // Photo-curation for the 38 newly-generated entries happens in a later phase;
    // until then, fall back to the template's cover image / chip-based theme photos
    // so the UI stays intact.
    const heroIsEmpty =
      typeof curated.hero === "string" ? curated.hero === "" : !curated.hero;
    const hero = heroIsEmpty ? (fallbacks.hero ?? FALLBACK_HERO) : curated.hero;
    const themes = curated.themes.map((t, i) => {
      const photoEmpty = typeof t.photo === "string" ? t.photo === "" : !t.photo;
      if (!photoEmpty) return t;
      const fallback = chipThemes[i % Math.max(chipThemes.length, 1)]?.photo;
      return { ...t, photo: fallback ?? (fallbacks.hero ?? FALLBACK_HERO) };
    });
    return { ...curated, hero, themes };
  }

  return {
    hero: fallbacks.hero ?? FALLBACK_HERO,
    tagline:
      fallbacks.tagline ??
      "A trip built around what you actually want, your dates, your pace, your group.",
    themes: chipThemes,
  };
}

/** Build a synthesized free-text prompt that includes the destination's
 *  themes, so parseIntent on the trip generator picks them up as soft
 *  must-haves. Used when the user clicks "Build my <destination> itinerary"
 *  on a sample-trip page. */
export function buildSampleTripPrompt(args: {
  destination: string;
  durationDays: number;
  themes: ThemeCard[];
}): string {
  const { destination, durationDays, themes } = args;
  // Lowercase the theme titles, strip purely-decorative leading words,
  // and join into a natural list. e.g. "Cenotes & Crystal Pools" → "cenotes & crystal pools".
  const list = themes
    .slice(0, 6)
    .map((t) =>
      t.title
        .toLowerCase()
        // drop generic leading words that don't help intent matching
        .replace(/^(the |a |on safari|made for two|into the |up in the |along the |after dark|until sunrise)/i, (m) =>
          m.trim() === "after dark" || m.trim() === "until sunrise" ? `${m.trim()} ` : "",
        )
        .trim(),
    )
    .filter(Boolean);
  if (list.length === 0) {
    return `${durationDays} days in ${destination}`;
  }
  return `${durationDays} days in ${destination}, including ${list.join(", ")}.`;
}
