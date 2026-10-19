# Office directory validation

Validation target: 32 distinct seed records, one record for each of the four catalogue service categories in each target city.

## Counts by city

| City | Offices | Birth | Caste | Domicile | Income |
|---|---:|---:|---:|---:|---:|
| Ghaziabad | 4 | 1 | 1 | 1 | 1 |
| Noida | 4 | 1 | 1 | 1 | 1 |
| Lucknow | 4 | 1 | 1 | 1 | 1 |
| Delhi | 4 | 1 | 1 | 1 | 1 |
| Mumbai | 4 | 1 | 1 | 1 | 1 |
| Kolkata | 4 | 1 | 1 | 1 | 1 |
| Chennai | 4 | 1 | 1 | 1 | 1 |
| Bengaluru | 4 | 1 | 1 | 1 | 1 |
| **Total** | **32** | **8** | **8** | **8** | **8** |

## Verification status

All 32 category relationships are marked `demo_assumed`. Official government pages support the named office, department, administrative area, and/or contact details where listed. These pages do not establish that each individual listed office issues the category assigned to it. The category links exist to support prototype filtering and must not be represented as verified certificate availability. The directory UI now states this limitation.

Office details left unknown in the source records remain null, including several addresses and phone numbers, most coordinates, and all working hours. Records may represent multiple named administrative officers or departments at the same official Collectorate address in Mumbai and Kolkata; these are separate directory records with different official designations, but they do not represent four different physical sites in those cities.

## Coordinates

Four Ghaziabad records have coordinates. The Collectorate uses an approximate point from an authoritative government survey described as opposite the building. The three tehsil coordinates below were supplied by the user as approximate values; no external source URL was supplied, and they have not been independently verified. They are explicitly marked approximate. The other 28 records remain `latitude: null` and `longitude: null`. Office-specific coordinates for those records were not established by the sources reviewed; nearby monitoring points, city/tehsil centroids, and geocoder guesses were not substituted.

| Office | Latitude | Longitude | Source | Precision |
|---|---:|---:|---|---|
| District Magistrate Office, Collectorate (Ghaziabad) | 28.67283 | 77.44731 | [National Green Tribunal Ghaziabad roadside survey](https://www.greentribunal.gov.in/sites/default/files/news_updates/QPR%20of%20Ghaziabad%20City%20Final%20in%20OA%20No.%20681%20of%202018.pdf), point described as opposite the Collectorate | Approximate; point is across from the building |
| Tehsil Ghaziabad | 28.696822 | 77.450649 | User-provided approximate coordinates; no source URL supplied | Approximate; not independently verified |
| Tehsil Modinagar | 28.8410 | 77.5910 | User-provided approximate coordinates; no source URL supplied | Approximate; not independently verified |
| Tehsil Loni | 28.7500 | 77.2800 | User-provided approximate coordinates; no source URL supplied | Approximate; not independently verified |

| City | Office records still needing office-specific coordinate evidence |
|---|---|
| Noida | City Magistrate, Noida; Tehsil Sadar, Gautam Buddha Nagar; NOIDA Administrative Complex; Chief Medical Officer Office, Gautam Buddha Nagar |
| Lucknow | Tehsildar Sadar; Tehsildar Malihabad; S-D-M Bakshi Ka Talab; Lucknow Collectorate |
| Delhi | SDM Karol Bagh Office; SDM Gandhi Nagar Office; SDM Mehrauli Office; SDM Najafgarh Office |
| Mumbai | Collector and District Magistrate, Mumbai City; Additional Collector, Mumbai City; Resident Deputy Collector, Mumbai City; Deputy Collector, Colaba Branch |
| Kolkata | Collector of Kolkata (Stamp & Revenue); Additional Collector of Kolkata (Stamp & Revenue); Revenue Officer, Kolkata Collectorate; Treasury Officer, Kolkata Collectorate Treasury |
| Chennai | Tondiarpet Taluk Office; Purasaiwalkam Taluk Office; Perambur Taluk Office; Egmore Taluk Office |
| Bengaluru | Deputy Commissioner Office, Bengaluru Urban; Bengaluru North Taluk Office; Bengaluru East (K.R. Pura) Taluk Office; Bengaluru South Taluk Office |

No external geocoder is used to set office pins. Radius searches exclude records whose office coordinates remain unknown and report their count.

## Sources

Each office record carries its government source URL and checked date. Sources used include the official district and revenue directories for Ghaziabad, Gautam Buddha Nagar, Lucknow, Delhi, Chennai, and Bengaluru Urban, plus the official Mumbai City Collector Office directory and Kolkata Collectorate contact directory. Source links are stored per record in [offices.json](./offices.json).

## Automated validation

`npm run test:offices` validates the 32-record count, unique seed keys and office names per city, one category per office, eight associations per category, all-services and individual-service searches, API filters, and the seed validator. The frontend `officeLocation` tests verify that All Services omits `serviceId` and that an ordinary directory search does not add a radius without GPS coordinates.
