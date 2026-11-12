/**
 * Real photographs used on marketing surfaces (spec section 14.4). Every one comes from Wikimedia
 * Commons under the licence named here; the credits are rendered on /about#photo-credits.
 * These are photos of places and room TYPES, never of a specific listing: a listing shows only
 * its owner's uploads.
 */
export type Photo = {
  src: string;
  alt: string;
  author: string;
  license: string;
  licenseUrl: string;
  sourceUrl: string;
};

export const spacesPhotos = {
  hostel: {"src": "/images/spaces/hostel.webp", "alt": "Hostel room with a bunk bed and study desks", "author": "ManoBV16", "license": "CC0", "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/", "sourceUrl": "https://commons.wikimedia.org/wiki/File:Hostel_Room_Inside_at_UAiU.jpg"},
  pg: {"src": "/images/spaces/pg.webp", "alt": "Twin room with two single beds and a wardrobe", "author": "Profpcde", "license": "CC0", "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/", "sourceUrl": "https://commons.wikimedia.org/wiki/File:Twin_room_in_a_German_youth_hostel_with_single_beds_and_wardrobe_B.jpg"},
  flat: {"src": "/images/spaces/flat.webp", "alt": "Living room of a furnished flat", "author": "ManoBV16", "license": "CC0", "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/", "sourceUrl": "https://commons.wikimedia.org/wiki/File:Hostel_Room_Common_Area.jpg"},
  coliving: {"src": "/images/spaces/coliving.webp", "alt": "Shared living room with sofas", "author": "Wilfredor", "license": "CC0", "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/", "sourceUrl": "https://commons.wikimedia.org/wiki/File:Living_room_in_apartment_of_Condom%C3%ADnio_do_Edif%C3%ADcio_Zaher,_Le_Blond,_Rio_de_Janeiro,_Brazil.jpg"},
} as const satisfies Record<string, Photo>;

export const citiesPhotos = {
  bengaluru: {"src": "/images/cities/bengaluru.webp", "alt": "Vidhana Soudha, Bengaluru", "author": "Moheen Reeyad", "license": "CC BY-SA 4.0", "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0/", "sourceUrl": "https://commons.wikimedia.org/wiki/File:Vidhana_Soudha,_front_(01).jpg"},
  mumbai: {"src": "/images/cities/mumbai.webp", "alt": "Mumbai skyline at night", "author": "Cididity Hat", "license": "CC BY-SA 3.0", "licenseUrl": "https://creativecommons.org/licenses/by-sa/3.0/", "sourceUrl": "https://commons.wikimedia.org/wiki/File:Mumbai_Skyline_at_Night.jpg"},
  delhi: {"src": "/images/cities/delhi.webp", "alt": "India Gate, Delhi", "author": "Mike_fleming from London, England", "license": "CC BY-SA 2.0", "licenseUrl": "https://creativecommons.org/licenses/by-sa/2.0/", "sourceUrl": "https://commons.wikimedia.org/wiki/File:India_Gate_-_Delhi_(37282946605).jpg"},
  gurugram: {"src": "/images/cities/gurugram.webp", "alt": "Cyber City, Gurugram", "author": "Tarun4u", "license": "CC BY-SA 4.0", "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0/", "sourceUrl": "https://commons.wikimedia.org/wiki/File:Cyber_City_View.jpg"},
  pune: {"src": "/images/cities/pune.webp", "alt": "Pune skyline along the river", "author": "Randy Breese", "license": "CC BY 2.0", "licenseUrl": "https://creativecommons.org/licenses/by/2.0/", "sourceUrl": "https://commons.wikimedia.org/wiki/File:Skyline_of_Pune_city_as_seen_from_The_Westin_Koregaon_Park.jpg"},
  hyderabad: {"src": "/images/cities/hyderabad.webp", "alt": "Charminar, Hyderabad", "author": "Joydeep", "license": "CC BY-SA 3.0", "licenseUrl": "https://creativecommons.org/licenses/by-sa/3.0/", "sourceUrl": "https://commons.wikimedia.org/wiki/File:Charminar_12032013.jpg"},
  chennai: {"src": "/images/cities/chennai.webp", "alt": "Marina Beach, Chennai", "author": "Saiphani02", "license": "CC BY-SA 4.0", "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0/", "sourceUrl": "https://commons.wikimedia.org/wiki/File:Marina_beach,_Chennai_aerial_view.jpg"},
  kolkata: {"src": "/images/cities/kolkata.webp", "alt": "Howrah Bridge, Kolkata", "author": "Bernard Gagnon", "license": "CC BY-SA 3.0", "licenseUrl": "https://creativecommons.org/licenses/by-sa/3.0/", "sourceUrl": "https://commons.wikimedia.org/wiki/File:Howrah_Bridge_02.jpg"},
} as const satisfies Record<string, Photo>;

export const allPhotos: readonly Photo[] = [...Object.values(spacesPhotos), ...Object.values(citiesPhotos)];
