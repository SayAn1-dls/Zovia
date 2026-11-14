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
  indore: { src: "/images/cities/indore.webp", alt: "Rajwada Palace, Indore", author: "Bernard Gagnon", license: "CC BY-SA 3.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/", sourceUrl: "https://commons.wikimedia.org/wiki/File:Rajwada_Palace,_Indore.jpg" },
  jaipur: { src: "/images/cities/jaipur.webp", alt: "Hawa Mahal, Jaipur", author: "Marcin Białek", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/", sourceUrl: "https://commons.wikimedia.org/wiki/File:Hawa_Mahal_2011.jpg" },
  ahmedabad: { src: "/images/cities/ahmedabad.webp", alt: "Sabarmati Riverfront, Ahmedabad", author: "Pravega", license: "CC0", licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/", sourceUrl: "https://commons.wikimedia.org/wiki/File:Sabarmati_riverfront_and_Atal_Pedestrian_Bridge_01.jpg" },
  lucknow: { src: "/images/cities/lucknow.webp", alt: "Bara Imambara, Lucknow", author: "Slyronit", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/", sourceUrl: "https://commons.wikimedia.org/wiki/File:Bara_Imambara,_Lucknow_2.jpg" },
  chandigarh: { src: "/images/cities/chandigarh.webp", alt: "Rock Garden, Chandigarh", author: "Slyronit", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/", sourceUrl: "https://commons.wikimedia.org/wiki/File:Rock_Garden,_Chandigarh_2.jpg" },
  noida: { src: "/images/cities/noida.webp", alt: "Noida skyline at night", author: "Divyendu Raj Sharma", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/", sourceUrl: "https://commons.wikimedia.org/wiki/File:Noida_Sector_78-76_Skyline_night_view.jpg" },
  kota: { src: "/images/cities/kota.webp", alt: "Chambal river, Kota", author: "Neer Rajora", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/", sourceUrl: "https://commons.wikimedia.org/wiki/File:Kota_Chambal_River.jpg" },
  bhopal: { src: "/images/cities/bhopal.webp", alt: "Upper Lake, Bhopal", author: "Sgbot321", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/", sourceUrl: "https://commons.wikimedia.org/wiki/File:Upper_Lake,_Bhopal,_M.P.jpg" },
  kochi: { src: "/images/cities/kochi.webp", alt: "Chinese fishing nets, Kochi", author: "Hans A. Rosbach", license: "CC BY-SA 3.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/", sourceUrl: "https://commons.wikimedia.org/wiki/File:Kochi_chinese_fishing-net-20080215-01a.jpg" },
  dehradun: { src: "/images/cities/dehradun.webp", alt: "Dehradun valley", author: "Gonesomewhereepic", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/", sourceUrl: "https://commons.wikimedia.org/wiki/File:The_himalayan_city_of_Dehradun_in_north_India.jpg" },
  bhubaneswar: { src: "/images/cities/bhubaneswar.webp", alt: "Lingaraja Temple, Bhubaneswar", author: "Bernard Gagnon", license: "CC BY-SA 3.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/", sourceUrl: "https://commons.wikimedia.org/wiki/File:Lingaraja_Temple_01.jpg" },
  nagpur: { src: "/images/cities/nagpur.webp", alt: "Nagpur Junction", author: "Vinoth offl", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/", sourceUrl: "https://commons.wikimedia.org/wiki/File:Nagpur_junction.jpg" },
  coimbatore: { src: "/images/cities/coimbatore.webp", alt: "Coimbatore from Marudhamalai", author: "Vibrantv", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/", sourceUrl: "https://commons.wikimedia.org/wiki/File:Panoramic_View_of_Coimbatore_from_Atop_Marudhamalai_Temple.jpg" },
  vadodara: { src: "/images/cities/vadodara.webp", alt: "Lakshmi Vilas Palace, Vadodara", author: "Birsa Murmu", license: "CC BY-SA 3.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/", sourceUrl: "https://commons.wikimedia.org/wiki/File:Lakshmi_Vilas_Palace,_Vadodara.jpg" },
  visakhapatnam: { src: "/images/cities/visakhapatnam.webp", alt: "Beach road, Visakhapatnam", author: "iMahesh", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/", sourceUrl: "https://commons.wikimedia.org/wiki/File:Ramakrishna_Beach_road_in_Visakhapatnam_(June_2019).jpg" },
  surat: { src: "/images/cities/surat.webp", alt: "Surat skyline", author: "RahulR.Bhadane", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/", sourceUrl: "https://commons.wikimedia.org/wiki/File:Surat_Skyline_01.jpg" },
  sonipat: { src: "/images/cities/sonipat.webp", alt: "Sonipat Junction", author: "Robyndahiya", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/", sourceUrl: "https://commons.wikimedia.org/wiki/File:Sonipat_junction.jpg" },
} as const satisfies Record<string, Photo>;

/** Interior photos used for Zovia's sample PG catalogue (room types, not any specific building). */
export const roomPhotos = {
  "room-twin": { src: "/images/rooms/room-twin.webp", alt: "Twin room with two single beds and a wardrobe", author: "Profpcde", license: "CC0", licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/", sourceUrl: "https://commons.wikimedia.org/wiki/File:Twin_room_in_a_German_youth_hostel_with_single_beds_and_wardrobe_A.jpg" },
  "room-budget": { src: "/images/rooms/room-budget.webp", alt: "Compact room with a bunk bed", author: "Aigars Mahinovs", license: "CC BY 2.0", licenseUrl: "https://creativecommons.org/licenses/by/2.0/", sourceUrl: "https://commons.wikimedia.org/wiki/File:Budget_Backpackers_room_(542725264).jpg" },
  "room-cleveland": { src: "/images/rooms/room-cleveland.webp", alt: "Bright shared room with beds and lockers", author: "Sumanah", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/", sourceUrl: "https://commons.wikimedia.org/wiki/File:Cleveland_Hostel_room.jpg" },
  "room-dorm-six": { src: "/images/rooms/room-dorm-six.webp", alt: "Six-bed shared room with bunk beds", author: "Sgroey", license: "CC BY 4.0", licenseUrl: "https://creativecommons.org/licenses/by/4.0/", sourceUrl: "https://commons.wikimedia.org/wiki/File:Hostel_6-bed_dorm_room,_Kuching,_Malaysia.jpg" },
  "room-candelaria": { src: "/images/rooms/room-candelaria.webp", alt: "Simple private room with a double bed", author: "charlieontravel (Flickr)", license: "CC BY 2.0", licenseUrl: "https://creativecommons.org/licenses/by/2.0/", sourceUrl: "https://commons.wikimedia.org/wiki/File:Hostel_La_Candelaria_room.jpg" },
  "room-iitb": { src: "/images/rooms/room-iitb.webp", alt: "Student room with a bed, desk and cupboard", author: "Prateek Karandikar", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/", sourceUrl: "https://commons.wikimedia.org/wiki/File:IITB_Hostel_room_in_hostel_1.JPG" },
  "room-jumbo": { src: "/images/rooms/room-jumbo.webp", alt: "Compact room with a single bed", author: "Albin Olsson", license: "CC BY-SA 3.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/", sourceUrl: "https://commons.wikimedia.org/wiki/File:Jumbo_Hostel_room.JPG" },
  "room-student": { src: "/images/rooms/room-student.webp", alt: "Spacious four-bed room with study desks and AC", author: "Chris Ikpemi", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/", sourceUrl: "https://commons.wikimedia.org/wiki/File:Nile.University_buildings_STUDENTS_ROOM.jpg" },
  "room-modern": { src: "/images/rooms/room-modern.webp", alt: "Modern furnished bedroom", author: "Sujoy Bera", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/", sourceUrl: "https://commons.wikimedia.org/wiki/File:Bedroom_3d_visualisation.jpg" },
  "kitchen-plant": { src: "/images/rooms/kitchen-plant.webp", alt: "Fitted kitchen with a dining chair", author: "SmashingIt99", license: "CC0", licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/", sourceUrl: "https://commons.wikimedia.org/wiki/File:Empty_apartment_in_Berlin_with_fitted_kitchen,_chair_and_plant.jpg" },
  "kitchen-fitted": { src: "/images/rooms/kitchen-fitted.webp", alt: "Clean fitted kitchen", author: "SmashingIt99", license: "CC0", licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/", sourceUrl: "https://commons.wikimedia.org/wiki/File:Empty_apartment_in_Berlin_with_fitted_kitchen_and_chair.jpg" },
  "kitchen-apartment": { src: "/images/rooms/kitchen-apartment.webp", alt: "Shared apartment kitchen", author: "Joe Allen", license: "CC BY 2.0", licenseUrl: "https://creativecommons.org/licenses/by/2.0/", sourceUrl: "https://commons.wikimedia.org/wiki/File:Apartment_-_kitchen_(5170875449).jpg" },
  "lounge-plants": { src: "/images/rooms/lounge-plants.webp", alt: "Common living room with sofa", author: "Lo", license: "CC0", licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/", sourceUrl: "https://commons.wikimedia.org/wiki/File:The_living_room_that_needs_houseplants.jpg" },
  "lounge-modern": { src: "/images/rooms/lounge-modern.webp", alt: "Modern common lounge with sofas", author: "Shixart1985", license: "CC BY 2.0", licenseUrl: "https://creativecommons.org/licenses/by/2.0/", sourceUrl: "https://commons.wikimedia.org/wiki/File:Modern_living_room_with_stylish_furniture_and_a_view_of_the_outdoors_in_a_cozy_apartment_setting.jpg" },
} as const satisfies Record<string, Photo>;

export type RoomPhotoKey = keyof typeof roomPhotos;

export const allPhotos: readonly Photo[] = [
  ...Object.values(spacesPhotos),
  ...Object.values(citiesPhotos),
  ...Object.values(roomPhotos),
];
