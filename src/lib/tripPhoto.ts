/* ─── Destination → Unsplash photo mapping ─── */

const PHOTO_DB: [string[], string][] = [
  // BRAZIL & SOUTH AMERICA
  [["rio", "rio de janeiro", "brazil", "brasil", "iguazu", "florianopolis", "sao paulo"], "https://images.unsplash.com/photo-1483729558449-99ef09a8c325?w=800&q=80"],
  [["buenos aires", "argentina"], "https://images.unsplash.com/photo-1589909202802-8f4aadce1849?w=800&q=80"],
  [["peru", "lima", "machu picchu", "cusco"], "https://images.unsplash.com/photo-1526392060635-9d6019884377?w=800&q=80"],
  [["chile", "santiago", "patagonia", "torres del paine"], "https://images.unsplash.com/photo-1501854140801-50d01698950b?w=800&q=80"],
  [["colombia", "bogota", "cartagena", "medellin"], "https://images.unsplash.com/photo-1583997052103-b4a1cb974ce5?w=800&q=80"],
  // SOUTHEAST ASIA
  [["bangkok", "thailand", "phuket", "chiang mai", "koh samui", "pattaya", "krabi"], "https://images.unsplash.com/photo-1508009603885-50cf7c579365?w=800&q=80"],
  [["bali", "ubud", "seminyak", "canggu"], "https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=800&q=80"],
  [["indonesia", "lombok", "jakarta", "komodo"], "https://images.unsplash.com/photo-1518548419970-58e3b4079ab2?w=800&q=80"],
  [["vietnam", "hanoi", "ho chi minh", "saigon", "hoi an", "halong", "da nang", "hue"], "https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=800&q=80"],
  [["singapore"], "https://images.unsplash.com/photo-1525625293386-3f8f99389edd?w=800&q=80"],
  [["malaysia", "kuala lumpur", "penang", "langkawi"], "https://images.unsplash.com/photo-1596422846543-75c6fc197f07?w=800&q=80"],
  [["philippines", "manila", "cebu", "palawan", "boracay", "siargao"], "https://images.unsplash.com/photo-1518509562904-e7ef99cdcc86?w=800&q=80"],
  [["cambodia", "siem reap", "angkor", "phnom penh"], "https://images.unsplash.com/photo-1508159452718-d22f6734a00d?w=800&q=80"],
  [["myanmar", "yangon", "bagan", "inle"], "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80"],
  // EAST ASIA
  [["japan", "tokyo", "kyoto", "osaka", "hiroshima", "nara", "hokkaido", "okinawa"], "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=800&q=80"],
  [["south korea", "seoul", "busan", "jeju"], "https://images.unsplash.com/photo-1538485399081-7191377e8241?w=800&q=80"],
  [["china", "beijing", "shanghai", "hong kong", "guilin", "chengdu", "xian"], "https://images.unsplash.com/photo-1537202108838-e7072bad1927?w=800&q=80"],
  [["taiwan", "taipei"], "https://images.unsplash.com/photo-1470004914212-05527e49370b?w=800&q=80"],
  // SOUTH ASIA
  [["india", "mumbai", "delhi", "goa", "jaipur", "rajasthan", "kerala", "agra", "taj mahal"], "https://images.unsplash.com/photo-1524492412937-b28074a5d7da?w=800&q=80"],
  [["nepal", "kathmandu", "everest", "pokhara"], "https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=800&q=80"],
  [["sri lanka", "colombo", "kandy", "galle"], "https://images.unsplash.com/photo-1552465011-b4e21bf6e79a?w=800&q=80"],
  // MIDDLE EAST
  [["dubai", "uae", "abu dhabi", "emirates"], "https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=800&q=80"],
  [["istanbul", "turkey", "ankara", "cappadocia", "bodrum", "antalya"], "https://images.unsplash.com/photo-1541432901042-2d8bd64b4a9b?w=800&q=80"],
  [["jordan", "petra", "amman", "wadi rum"], "https://images.unsplash.com/photo-1518368659672-53e20c9a5b11?w=800&q=80"],
  [["israel", "tel aviv", "jerusalem"], "https://images.unsplash.com/photo-1544967082-d9d25d867d66?w=800&q=80"],
  // AFRICA
  [["morocco", "marrakech", "casablanca", "fez", "sahara", "chefchaouen"], "https://images.unsplash.com/photo-1539020140153-e479b8f22986?w=800&q=80"],
  [["egypt", "cairo", "pyramids", "luxor", "sharm", "hurghada", "aswan"], "https://images.unsplash.com/photo-1553913861-c0fddf2619ee?w=800&q=80"],
  [["kenya", "nairobi", "masai mara", "serengeti", "kilimanjaro"], "https://images.unsplash.com/photo-1516026672322-bc52d61a55d5?w=800&q=80"],
  [["tanzania", "zanzibar", "dar es salaam"], "https://images.unsplash.com/photo-1516026672322-bc52d61a55d5?w=800&q=80"],
  [["south africa", "cape town", "johannesburg", "garden route", "kruger"], "https://images.unsplash.com/photo-1580060839134-75a5edca2e99?w=800&q=80"],
  // WESTERN EUROPE
  [["paris", "france", "versailles", "nice", "lyon", "bordeaux", "provence", "côte d'azur"], "https://images.unsplash.com/photo-1499856871958-5b9627545d1a?w=800&q=80"],
  [["rome", "italy", "milan", "venice", "florence", "naples", "amalfi", "sicily", "sardinia", "tuscany", "cinque terre"], "https://images.unsplash.com/photo-1552832230-c0197dd311b5?w=800&q=80"],
  [["barcelona", "spain", "madrid", "seville", "granada", "ibiza", "mallorca", "valencia", "bilbao"], "https://images.unsplash.com/photo-1523531294919-4bcd7c65e216?w=800&q=80"],
  [["amsterdam", "netherlands", "rotterdam"], "https://images.unsplash.com/photo-1534351590666-13e3e96b5017?w=800&q=80"],
  [["london", "england", "uk", "britain", "scotland", "edinburgh", "manchester", "liverpool"], "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=800&q=80"],
  [["ireland", "dublin", "galway"], "https://images.unsplash.com/photo-1549918864-48ac978761a4?w=800&q=80"],
  [["lisbon", "porto", "portugal", "algarve", "madeira"], "https://images.unsplash.com/photo-1585208798174-6cedd86e019a?w=800&q=80"],
  [["greece", "athens", "santorini", "mykonos", "crete", "rhodes", "thessaloniki"], "https://images.unsplash.com/photo-1533105079780-92b9be482077?w=800&q=80"],
  [["croatia", "dubrovnik", "split", "zagreb", "hvar", "plitvice"], "https://images.unsplash.com/photo-1555990538-c4e0b7c5e5e9?w=800&q=80"],
  [["switzerland", "zurich", "geneva", "bern", "interlaken", "zermatt", "lucerne"], "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80"],
  [["austria", "vienna", "salzburg", "innsbruck"], "https://images.unsplash.com/photo-1516550893923-42d28e5677af?w=800&q=80"],
  [["germany", "berlin", "munich", "hamburg", "frankfurt", "cologne", "bavaria", "heidelberg"], "https://images.unsplash.com/photo-1587330979470-3595ac045ab0?w=800&q=80"],
  [["prague", "czech", "czechia", "brno"], "https://images.unsplash.com/photo-1592906209472-a36b1f3782ef?w=800&q=80"],
  [["budapest", "hungary"], "https://images.unsplash.com/photo-1551867633-194f125bddfa?w=800&q=80"],
  [["poland", "warsaw", "krakow", "gdansk", "wroclaw"], "https://images.unsplash.com/photo-1519197924294-4ba991a11128?w=800&q=80"],
  [["belgium", "brussels", "bruges", "ghent", "antwerp"], "https://images.unsplash.com/photo-1491557345352-5929e343eb89?w=800&q=80"],
  // SCANDINAVIA
  [["norway", "oslo", "bergen", "fjord", "lofoten", "northern lights", "aurora", "tromso"], "https://images.unsplash.com/photo-1531366936337-7c912a4589a7?w=800&q=80"],
  [["sweden", "stockholm", "gothenburg", "malmö"], "https://images.unsplash.com/photo-1509356843151-3e7d96241e11?w=800&q=80"],
  [["denmark", "copenhagen"], "https://images.unsplash.com/photo-1513622470522-26c3c8a854bc?w=800&q=80"],
  [["finland", "helsinki", "lapland"], "https://images.unsplash.com/photo-1538332576228-eb5b4c4de6f5?w=800&q=80"],
  [["iceland", "reykjavik"], "https://images.unsplash.com/photo-1476610182048-b716b8518aae?w=800&q=80"],
  // EASTERN EUROPE
  [["russia", "moscow", "st petersburg"], "https://images.unsplash.com/photo-1513326738677-b964603b136d?w=800&q=80"],
  [["ukraine", "kyiv", "lviv"], "https://images.unsplash.com/photo-1591202459558-4ed5c5c8e74a?w=800&q=80"],
  [["romania", "bucharest", "transylvania", "brasov"], "https://images.unsplash.com/photo-1564658012846-e2e16b9cd0d4?w=800&q=80"],
  [["georgia", "tbilisi", "batumi"], "https://images.unsplash.com/photo-1565008576549-57569a49371d?w=800&q=80"],
  [["armenia", "yerevan"], "https://images.unsplash.com/photo-1589656966895-2f33e7653819?w=800&q=80"],
  [["azerbaijan", "baku"], "https://images.unsplash.com/photo-1555708982-8645ec9ce3cc?w=800&q=80"],
  // NORTH AMERICA
  [["new york", "nyc", "manhattan", "brooklyn"], "https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?w=800&q=80"],
  [["los angeles", "hollywood", "beverly hills"], "https://images.unsplash.com/photo-1534190760961-74e8c1c5c3da?w=800&q=80"],
  [["san francisco", "california", "napa"], "https://images.unsplash.com/photo-1501594907352-04cda38ebc29?w=800&q=80"],
  [["las vegas", "nevada"], "https://images.unsplash.com/photo-1605833556294-ea5c7a74f57d?w=800&q=80"],
  [["miami", "florida", "orlando", "key west"], "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80"],
  [["new orleans", "louisiana"], "https://images.unsplash.com/photo-1568702846914-96b305d2aaeb?w=800&q=80"],
  [["chicago", "illinois"], "https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=800&q=80"],
  [["canada", "toronto", "vancouver", "montreal", "banff", "alberta", "quebec"], "https://images.unsplash.com/photo-1517935706615-2717063c2225?w=800&q=80"],
  [["mexico", "cancun", "mexico city", "tulum", "playa del carmen", "oaxaca", "guadalajara"], "https://images.unsplash.com/photo-1585464231875-d9ef1f5ad396?w=800&q=80"],
  [["cuba", "havana"], "https://images.unsplash.com/photo-1500759285222-a95626359a97?w=800&q=80"],
  // OCEANIA
  [["sydney", "australia", "melbourne", "brisbane", "cairns", "great barrier reef", "uluru"], "https://images.unsplash.com/photo-1506973035872-a4ec16b8e8d9?w=800&q=80"],
  [["new zealand", "auckland", "queenstown", "rotorua", "milford sound"], "https://images.unsplash.com/photo-1507699622108-4be3abd695ad?w=800&q=80"],
  // INDIAN OCEAN & ISLANDS
  [["maldives"], "https://images.unsplash.com/photo-1573843981267-be1999ff37cd?w=800&q=80"],
  [["mauritius", "seychelles", "reunion"], "https://images.unsplash.com/photo-1589979481223-deb893043163?w=800&q=80"],
  // GENERIC TRIP TYPES
  [["ski", "skiing", "snowboard", "alps", "winter", "mountain", "hiking", "trek"], "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800&q=80"],
  [["beach", "island", "coast", "surf", "tropical"], "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&q=80"],
  [["safari", "wildlife", "jungle"], "https://images.unsplash.com/photo-1516026672322-bc52d61a55d5?w=800&q=80"],
  [["wedding", "bride", "married"], "https://images.unsplash.com/photo-1519741497674-611481863552?w=800&q=80"],
  [["festival", "carnival", "party"], "https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=800&q=80"],
  [["road trip", "campervan", "road"], "https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=800&q=80"],
];

export const DEFAULT_TRIP_PHOTO = "https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=800&q=80";

// Resolve the cover photo for a trip. Priority order:
//   1. destinationImageUrl  — auto-resolved per-destination URL stored on
//      trips.destination_image_url by generate-trip-itinerary (Google Place
//      Photos with Wikimedia Commons fallback). Specific to the actual city.
//   2. PHOTO_DB keyword match — legacy country/region-level Unsplash mapping.
//      Kept as a final fallback for legacy trips that have neither a user
//      cover_image_path nor an auto-resolved destination_image_url.
//   3. DEFAULT_TRIP_PHOTO   — generic travel image.
//
// Callers handle the user-uploaded cover (cover_image_path) ahead of this
// function, e.g. `coverSignedUrl || resolvePhoto(...)`.
export function resolvePhoto(
  tripName: string,
  routeStopDests: string[],
  destinationImageUrl?: string | null,
): string {
  if (typeof destinationImageUrl === "string" && destinationImageUrl.trim().length > 0) {
    return destinationImageUrl;
  }
  const nameLower = tripName.toLowerCase();
  for (const [keywords, url] of PHOTO_DB) {
    if (keywords.some((kw) => nameLower.includes(kw))) return url;
  }
  for (const dest of routeStopDests) {
    const destLower = dest.toLowerCase();
    for (const [keywords, url] of PHOTO_DB) {
      if (keywords.some((kw) => destLower.includes(kw))) return url;
    }
  }
  return DEFAULT_TRIP_PHOTO;
}
