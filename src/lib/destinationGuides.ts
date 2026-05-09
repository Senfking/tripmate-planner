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
    description: "Pistes, powder and fireside après — the season at full volume.",
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
    description: "Pedal between cafés and canals — the easiest way to see a city like a local.",
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
    south_america: { title: "Big Adventures",       description: "Inca trails, Amazon rivers, dunes and altitude — earned days, hard-slept nights.", photo: U("photo-1526392060635-9d6019884377") },
    central_america: { title: "Rainforest & Surf",  description: "Surf breaks, zip-lines, river floats and waterfalls you can swim under.", photo: U("photo-1518562923054-9a8f74917d61") },
    south_asia:    { title: "High Himalaya",        description: "Trek days that turn into stories — passes, prayer flags and cups of butter tea.", photo: U("photo-1464822759023-fed622ff2c3b") },
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
    themes: [
      { title: "Cenotes & Crystal Pools", description: "Dive into freshwater cenotes hidden in jungle limestone, cool and impossibly clear.", photo: U("photo-1518638150340-f706e86654de") },
      { title: "Ancient Mayan Ruins",     description: "Walk the cliffside ruins of Tulum at sunrise before the heat and the crowds arrive.", photo: U("photo-1568402102990-bbd4d11dee7c") },
      { title: "Boho Beach Clubs",        description: "Macramé hammocks, mezcal cocktails and DJ sets that drift into golden hour.", photo: U("photo-1507525428034-b723cf961d3e") },
      { title: "Yucatán Cuisine",         description: "Tacos al pastor, fresh ceviche and slow-cooked cochinita pibil from open-air kitchens.", photo: U("photo-1565299585323-38d6b0865b47") },
      { title: "Wellness & Yoga",         description: "Sunrise yoga on the sand, temazcal ceremonies and beachfront massages.", photo: U("photo-1545205597-3d9d02c29597") },
      { title: "Cycling the Coast",       description: "Pedal the long ribbon of road between jungle and sea — the best way to see Tulum.", photo: U("photo-1485965120184-e220f721d03e") },
    ],
  },
  "tokyo-10-days": {
    hero: U("photo-1540959733332-eab4deabeeaf"),
    tagline:
      "A city of paradoxes — neon-soaked crossings and quiet shrines, vending-machine ramen and three-Michelin-star sushi. Ten days here is barely enough.",
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
    themes: [
      { title: "Alfama & the Old Quarter", description: "Cobblestone alleys, blue-tiled facades and the city's oldest fado houses.", photo: U("photo-1555881400-74d7acaacd8b") },
      { title: "Pastéis & Café Culture",   description: "Warm custard tarts straight from the oven, espresso at a marble counter.", photo: U("photo-1551024601-bec78aea704b") },
      { title: "Tram 28 & Viewpoints",     description: "The yellow tram clatters past every miradouro worth standing on at sunset.", photo: U("photo-1518730518541-d0843268c287") },
      { title: "Day Trip to Sintra",       description: "Fairytale palaces in misty hills — a day that feels like a different country.", photo: U("photo-1558102822-da570eb113b8") },
      { title: "Seafood by the Tagus",     description: "Grilled sardines, octopus rice and natural wine on tiled tavern terraces.", photo: U("photo-1414235077428-338989a2e8c0") },
      { title: "Sunset on the Coast",      description: "Cascais cliffs, Cabo da Roca and the wide Atlantic glowing pink at the end of the day.", photo: U("photo-1493558103817-58b2924bce98") },
    ],
  },
  "bali-7-days": {
    hero: U("photo-1537996194471-e657df975ab4"),
    tagline:
      "Rice terraces glowing green at dawn, surf breaks at lunch, beach clubs at dusk. Bali holds room for adventure, ceremony and complete stillness — sometimes all in one day.",
    themes: [
      { title: "Ubud's Rice Terraces",  description: "Walk the carved green steps of Tegallalang in the cool of early morning.", photo: U("photo-1537996194471-e657df975ab4") },
      { title: "Temples & Ceremony",    description: "Cliffside Uluwatu at sunset, water temples at sunrise, daily offerings on every doorstep.", photo: U("photo-1539650116574-75c0c6d73f6e") },
      { title: "Canggu Beach Clubs",    description: "Sunset cocktails at Single Fin, infinity pools and DJ sets long into the night.", photo: U("photo-1507525428034-b723cf961d3e") },
      { title: "Surf & Swim",           description: "Mellow long-boarding at Batu Bolong or barrels at Uluwatu — Bali has a wave for everyone.", photo: U("photo-1502933691298-84fc14542831") },
      { title: "Wellness & Yoga",       description: "Daily flow at the Yoga Barn, jungle spa days and breakfast bowls under thatched roofs.", photo: U("photo-1545205597-3d9d02c29597") },
      { title: "Waterfalls & Volcanoes", description: "Sunrise hike up Mt. Batur or chase hidden waterfalls in the jungle around Munduk.", photo: U("photo-1531168556467-80aace0d0144") },
    ],
  },
  "dubai-4-days": {
    hero: U("photo-1512453979798-5ea266f8880c"),
    tagline:
      "A skyline that looks invented and a desert that feels eternal. Dubai turns up the volume on everything — brunches, beaches, towers and the silence between dunes.",
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
    themes: [
      { title: "Gaudí's Barcelona",       description: "Sagrada Familia, Park Güell and Casa Batlló — buildings that feel grown, not built.", photo: U("photo-1583422409516-2895a77efded") },
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
      "Mayan pyramids in jungle clearings, cenotes hidden under limestone and colonial cities painted every color. A week barely scratches the surface — but what a week.",
    themes: [
      { title: "Ancient Ruins",      description: "Walk Chichén Itzá, Tulum and the lesser-known temples lost in the Yucatán jungle.", photo: U("photo-1568402102990-bbd4d11dee7c") },
      { title: "Cenotes & Caves",    description: "Swim in freshwater pools beneath the jungle floor — the Mayan underworld, made for floating.", photo: U("photo-1518638150340-f706e86654de") },
      { title: "Caribbean Beaches",  description: "Powder sand, warm turquoise water and beach clubs with their feet in the sea.", photo: U("photo-1507525428034-b723cf961d3e") },
      { title: "Mexican Cuisine",    description: "Tacos al pastor, mole, cochinita pibil and the kind of mezcal you can only find here.", photo: U("photo-1565299585323-38d6b0865b47") },
      { title: "Colonial Cities",    description: "Pastel-painted streets, baroque cathedrals and rooftop bars that catch the breeze.", photo: U("photo-1518105779142-d975f22f1b0a") },
      { title: "Markets & Mezcal",   description: "Local artisan markets, mezcalerías and the slow rituals around Mexico's most-prized spirit.", photo: U("photo-1551024601-bec78aea704b") },
    ],
  },
  "new-york-4-days": {
    hero: U("photo-1496442226666-8d4d0e62e6e9"),
    tagline:
      "The city that taught everywhere else how to be a city. Bagels at dawn, gallery hops by day, rooftop bars after dark — four days, fifty memories.",
    themes: [
      { title: "Iconic Skyline",            description: "Top of the Rock at sunset, the Brooklyn Bridge at dusk, the Empire State at night.", photo: U("photo-1496442226666-8d4d0e62e6e9") },
      { title: "Neighborhood by Neighborhood", description: "SoHo to West Village to Williamsburg — each block its own personality.", photo: U("photo-1543716091-a840c05249ec") },
      { title: "World-Class Eats",          description: "Bagels, slices, dim sum, omakase and the late-night diner you'll dream about.", photo: U("photo-1414235077428-338989a2e8c0") },
      { title: "Galleries & Museums",       description: "The Met, MoMA, the Whitney and a hundred small galleries hiding in Chelsea lofts.", photo: U("photo-1466442929976-97f336a657be") },
      { title: "Central Park",              description: "Boating in summer, ice skating in winter — the city's living room in every season.", photo: U("photo-1534430480872-3498386e7856") },
      { title: "Broadway & Beyond",         description: "A Broadway show, an off-off-Broadway gem and jazz in a basement in the Village.", photo: U("photo-1514525253161-7a46d19cd819") },
    ],
  },
  "london-5-days": {
    hero: U("photo-1486299267070-83823f5448dd"),
    tagline:
      "Centuries layered street by street — palaces and pubs, markets and museums, all of it walkable if you wear the right shoes.",
    themes: [
      { title: "Royal & Historic",     description: "Westminster, the Tower, Buckingham Palace and the small streets that still feel medieval.", photo: U("photo-1486299267070-83823f5448dd") },
      { title: "World-Class Museums",  description: "The British Museum, the V&A, the Tate — and most of them are free.", photo: U("photo-1466442929976-97f336a657be") },
      { title: "Pubs & Sunday Roasts", description: "Wood-paneled pubs, garden beers and a Sunday roast that lasts most of the afternoon.", photo: U("photo-1514933651103-005eec06c04b") },
      { title: "Markets & Eats",       description: "Borough Market, Brick Lane, Maltby Street — London eats brilliantly, all over town.", photo: U("photo-1481437156560-3205f6a55735") },
      { title: "Theatreland",          description: "West End shows, fringe theatre and the long pre-show pint at a 300-year-old pub.", photo: U("photo-1514525253161-7a46d19cd819") },
      { title: "Parks & Green Spaces", description: "Hyde Park, Hampstead Heath and the canal-side walks that feel miles from the city.", photo: U("photo-1534430480872-3498386e7856") },
    ],
  },
  "bangkok-5-days": {
    hero: U("photo-1508009603885-50cf7c579365"),
    tagline:
      "A city that runs on heat, motorbikes and street food smoke. Gilded temples in the morning, rooftop bars by night — Bangkok rewards anyone who keeps up.",
    themes: [
      { title: "Glittering Temples",     description: "Wat Pho, Wat Arun and the Grand Palace — gold and tilework that catches the morning sun.", photo: U("photo-1508009603885-50cf7c579365") },
      { title: "Street Food Crawl",      description: "Pad thai at midnight, mango sticky rice from a cart, boat noodles in a 50-year-old shop.", photo: U("photo-1559314809-0d155014e29e") },
      { title: "Markets at Every Hour",  description: "Chatuchak by day, Asiatique at sunset, Khao San after midnight — Bangkok never closes.", photo: U("photo-1481437156560-3205f6a55735") },
      { title: "Rooftop Bars",           description: "Cocktails 60 floors above the river — Lebua, Vertigo, the unnamed ones the locals love.", photo: U("photo-1582719508461-905c673771fd") },
      { title: "Klongs & River Life",    description: "Long-tail boats through the canals, sunset on the Chao Phraya and floating markets at dawn.", photo: U("photo-1493020258366-be3ead61c4e0") },
      { title: "Day Trip to Ayutthaya",  description: "The ruined royal capital — temples reclaimed by jungle, a 90-minute train ride away.", photo: U("photo-1539650116574-75c0c6d73f6e") },
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
  if (curated) return curated;

  const region = regionForCountry(fallbacks.countryIso ?? null);
  const chips = fallbacks.chips ?? [];
  const themes: ThemeCard[] = [];
  const seenTitle = new Set<string>();
  const seenPhoto = new Set<string>();

  const tryPush = (t: ThemeCard | null) => {
    if (!t) return;
    const photoUrl = typeof t.photo === "string" ? t.photo : t.photo.url;
    if (seenTitle.has(t.title) || seenPhoto.has(photoUrl)) return;
    themes.push(t);
    seenTitle.add(t.title);
    seenPhoto.add(photoUrl);
  };

  for (const chip of chips) tryPush(chipTheme(chip, region));
  // Pad to 4 if thin — pull region-appropriate generics in priority order.
  for (const fallbackChip of ["Food", "Culture", "Nature", "City"]) {
    if (themes.length >= 4) break;
    tryPush(chipTheme(fallbackChip, region));
  }

  return {
    hero: fallbacks.hero ?? U("photo-1488646953014-85cb44e25828"),
    tagline:
      fallbacks.tagline ??
      "A trip built around what you actually want — your dates, your pace, your group.",
    themes,
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
