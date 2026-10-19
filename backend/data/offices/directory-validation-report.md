# Office directory validation

## Import summary

Reviewed input: [`office_directory_research_128.json`](../../../office_directory_research_128.json), with the matching CSV available at the repository root. It contains 128 rows: 16 per city and four proposed category assignments per city/category. **127 rows are represented** in the curated directory; **one row was rejected** because Ghaziabad candidate `ghaziabad-15` describes a multi-tehsil network, not one distinct office. Candidate `ghaziabad-16` was merged into the already-curated District Magistrate Office / Collectorate identity represented by `ghaziabad-08`. In total, 126 unique accepted candidate identities are represented; 108 are new office identities, and 19 accepted rows were merged into existing identities (including the repeated Collectorate row). Existing offices were retained.

The resulting directory has **146 unique office identities**. It does not contain 128 records: the reviewed rows include a duplicate identity and one rejected network entry, and the merge retains 20 existing offices that are not represented by a research candidate. See [`research-import-audit.json`](./research-import-audit.json) for row dispositions and machine-readable counts.

| City | Input rows | Accepted candidate rows | New office identities | Accepted rows merged to existing identities | Rejected rows |
|---|---:|---:|---:|---:|---:|
| Ghaziabad | 16 | 15 | 10 | 5 | 1 |
| Noida | 16 | 16 | 14 | 2 | 0 |
| Lucknow | 16 | 16 | 12 | 4 | 0 |
| Delhi | 16 | 16 | 14 | 2 | 0 |
| Mumbai | 16 | 16 | 13 | 3 | 0 |
| Kolkata | 16 | 16 | 16 | 0 | 0 |
| Chennai | 16 | 16 | 13 | 3 | 0 |
| Bengaluru | 16 | 16 | 16 | 0 | 0 |
| **Total** | **128** | **127** | **108** | **19** | **1** |

## Directory counts

| City | Final records | Accepted research assignments: Birth | Caste | Income | Domicile | Complete street address | Incomplete street address |
|---|---:|---:|---:|---:|---:|---:|---:|
| Ghaziabad | 14 | 4 | 4 | 4 | 3 | 11 | 3 |
| Noida | 18 | 4 | 4 | 4 | 4 | 0 | 16 |
| Lucknow | 16 | 4 | 4 | 4 | 4 | 10 | 6 |
| Delhi | 18 | 4 | 4 | 4 | 4 | 16 | 0 |
| Mumbai | 20 | 4 | 4 | 4 | 4 | 16 | 0 |
| Kolkata | 20 | 4 | 4 | 4 | 4 | 16 | 0 |
| Chennai | 20 | 4 | 4 | 4 | 4 | 16 | 0 |
| Bengaluru | 20 | 4 | 4 | 4 | 4 | 16 | 0 |
| **Total** | **146** | **32** | **32** | **32** | **31** | **101** | **29** |

Address columns above describe the 127 accepted candidate rows (so the duplicate Collectorate is counted twice); the deduplicated directory has 101 complete-address identities and 25 incomplete-address identities. Twenty older identities not represented by the research input remain `not_reassessed`. Incomplete status is retained when the source identifies an office but does not publish a complete street address; the supplied locality description is preserved in `researchMetadata.addressEvidence.rawAddress`, and unknown address fields remain null where applicable.

The accepted candidate assignments carry these demo category totals: Birth Certificate 32, Caste Certificate 32, Income Certificate 32, and Domicile Certificate 31. Ghaziabad Domicile is short one because the network row was rejected. These are **directory organization tags only**; they do not establish that an office offers or issues the service. Per the existing service catalogue, only Uttar Pradesh Income/Caste/Domicile IDs and the Delhi Birth ID can safely be attached to their matching jurisdiction. Of the 127 candidate assignments, 39 have a region-compatible catalogue link; 88 are retained as evidence in JSON metadata but are not mapped to a mismatched service ID. Two older, region-compatible demo links remain on existing Noida offices outside the candidate rows. Across the final data, there are 41 catalogue links, all `demo_assumed`, and **zero independently verified service-authority relationships**. The UI states that directory categories do not confirm service availability.

## Coordinate coverage and sources

Fourteen Ghaziabad records have coordinates; across the full directory, 14 records have coordinates and 132 do not. All 14 are marked approximate, and **zero are independently verified exact office coordinates**. Radius searches can calculate distances only for records with coordinate pairs; the other 132 are excluded from radius results. The API retains the unavailable-coordinate count internally for filtering tests; the Offices page does not show a warning message for it.

| Office | Coordinates | Provenance | Status |
|---|---|---|---|
| District Magistrate Office, Collectorate, Ghaziabad | 28.67283, 77.44731 | [National Green Tribunal Ghaziabad roadside survey](https://www.greentribunal.gov.in/sites/default/files/news_updates/QPR%20of%20Ghaziabad%20City%20Final%20in%20OA%20No.%20681%20of%202018.pdf), point described as opposite the Collectorate | Approximate nearby survey point, not the office entrance |
| Tehsil Ghaziabad | 28.696822, 77.450649 | User-provided approximate coordinate; no source URL supplied | Approximate, not independently verified |
| Tehsil Modinagar | 28.8410, 77.5910 | User-provided approximate coordinate; no source URL supplied | Approximate, not independently verified |
| Tehsil Loni | 28.7500, 77.2800 | User-provided approximate coordinate; no source URL supplied | Approximate, not independently verified |
| Ghaziabad Nagar Nigam – City Zone | 28.6631, 77.4339 | User-provided approximate coordinate; no source URL supplied | Approximate, not independently verified |
| Ghaziabad Nagar Nigam – Mohan Nagar Zone | 28.6798, 77.3739 | User-provided approximate coordinate; no source URL supplied | Approximate, not independently verified |
| Ghaziabad Nagar Nigam – Vijay Nagar Zone | 28.6416, 77.4475 | User-provided approximate coordinate; no source URL supplied | Approximate, not independently verified |
| Ghaziabad Nagar Nigam – Vasundhara Zone | 28.6588, 77.3687 | User-provided approximate coordinate; no source URL supplied | Approximate, not independently verified |
| Ghaziabad Nagar Nigam – Kavi Nagar Zone | 28.6712, 77.4561 | User-provided approximate coordinate; no source URL supplied | Approximate, not independently verified |
| Ghaziabad Nagar Nigam – Head Office | 28.6652, 77.4422 | User-provided approximate coordinate; no source URL supplied | Approximate, not independently verified |
| Ghaziabad Nagar Nigam – Camp Office | 28.6825, 77.4468 | User-provided approximate coordinate; no source URL supplied | Approximate, not independently verified |
| Jan Suvidha Kendra – Tehsil Ghaziabad | 28.6653, 77.4419 | User-provided approximate coordinate; no source URL supplied | Approximate, not independently verified; separate identity from Tehsil Ghaziabad |
| Jan Suvidha Kendra – Loni | 28.7513, 77.2882 | User-provided approximate coordinate; no source URL supplied | Approximate, not independently verified; separate identity from Tehsil Loni |
| Jan Suvidha Kendra – Modinagar | 28.8415, 77.5816 | User-provided approximate coordinate; no source URL supplied | Approximate, not independently verified; separate identity from Tehsil Modinagar |

The ten additional Ghaziabad coordinate pairs were supplied by the user, are marked approximate, and have no independent source URL. The distinct Tehsil and Jan Suvidha Kendra records retain separate coordinate values. Tests retain the latest user-provided reference distances with origin 28.751582, 77.499320, but production results remain Haversine calculations from the current user's origin and each office's coordinates. Calculated one-decimal distances for the 14 rows are 10.1, 7.7, 13.4, 21.4, 11.7, 14.6, 13.2, 16.4, 9.9, 11.1, 9.2, 11.1, 20.6, and 12.8 km respectively; these are not overwritten to force a match to reference readings. The official [Ghaziabad Nagar Nigam contact directory](https://ghaziabadnagarnigam.in/contact-us.aspx) confirms the municipal offices and addresses, but does not publish coordinates. Office names, addresses, candidate category, source URLs, address verification, coordinate provenance, and research notes remain in curated JSON. Research candidates have official office/source references; service issuance remains unverified for all 127 assignments. Primary sources in the reviewed material include district `.nic.in` pages, state government `.gov.in` pages, and the [Kolkata Municipal Corporation Birth Registration directory](https://www.kmcgov.in/KMCPortal/jsp/KMCBirth.jsp). Specific source URLs are carried per record.

## Schema and filtering decisions

The current Prisma office schema cannot persist `researchMetadata` or `addressVerificationStatus`, and its office-service relation has no link-level verification status field. These fields remain in `offices.json` and are included in API output for matching curated records; **no schema change or migration was made**. Existing service IDs were preserved. The search layer now filters known catalogue IDs against their configured region, and JSON/API service results do not expose a known service link outside its jurisdiction. Nonmatching category assignments remain retained in research metadata, not as active service links. Search continues to compose city, state, service, and radius filters; radius calculations use the supplied user coordinates and office coordinates, omit offices without usable coordinate pairs, and retain the excluded count internally. The Offices page presents office names, addresses, available phone numbers, source links, calculated distances, and map links without category or incomplete-address warning copy.

All Services returns every configured office for the chosen city: Ghaziabad 14, Noida 18, Lucknow 16, Delhi 18, Mumbai 20, Kolkata 20, Chennai 20, Bengaluru 20. These are not balanced 16-record production directories. Individual active catalogue filters currently return: Birth 4 (Delhi only), Caste 12 (four each in Ghaziabad, Noida, Lucknow), Income 13 (four each in Ghaziabad/Lucknow and five in Noida), and Domicile 12 (three Ghaziabad, five Noida, four Lucknow). Other jurisdictions need appropriate catalogue IDs and verified/local associations before their category tags can be exposed as service-filter links.

## Remaining gaps

- The final data contains 146 identities, rather than a balanced 128-record directory; the city totals above reflect retained existing offices and research identity merges.
- One candidate row was rejected, leaving Ghaziabad with three accepted Domicile category assignments.
- Noida's 16 new candidate addresses are incomplete; Ghaziabad and Lucknow also have incomplete street-level addresses. No missing street address or PIN was inferred.
- Fourteen approximate Ghaziabad coordinates now exist. No exact, independently verified office coordinates are currently established.
- No office-service authorization is independently verified. 88 research category assignments have no safe matching service ID in the existing state-scoped catalogue; they remain metadata only.
- API-only provenance fields are not persisted by the current database schema. A future schema proposal would be needed before database-backed records can store them durably.
