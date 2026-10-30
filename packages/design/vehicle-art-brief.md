# DigiGate vehicle art brief

> **Decision, 2026-10-30: the apps use only the 12 neutral grey generics (`generic-<body>-neutral`).** A picture of a specific model or paint colour misleads guards when the car doesn't quite match it: an older Hilux shown as the new model, an orange disc colour that comes out red. A guard could then take a genuine car for a stolen one. The app picks the body shape from the disc's description and shows the make, model and colour as the disc's own words. Model art and coloured generics are not used, and no more are to be made. The rest of this brief is kept as a record of the original plan.

DigiGate is a security system for boom-gated sites: hospitals first, then residential estates. Guards scan the licence disc on a car's windscreen when it comes in and when it leaves. The disc tells us the car's make, model and colour.

We want every car on screen to look like the real car, the way ride-hailing apps show "White Ford Ranger" as a picture of a white Ford Ranger. This brief lists the cars and the rules that make them all look like one tailor-made set.

## Where the art appears

- **Gate app** (a rugged Android handheld, used outdoors in direct sunlight): the car being checked; the "arrived in / trying to leave in" comparison when a driver tries to leave in a different car; the list of who is on site. Shown about **160 px wide**.
- **Dashboard** (web, light and dark themes): live on-site list, visit log, alerts. Shown from **64 px** up to about **320 px** wide.

The app picks the picture from the disc in this order:

1. The exact model in the disc's colour, e.g. `toyota-hilux-double-cab-white`.
2. A generic car of the same body type in that colour, e.g. `generic-bakkie-double-cab-white`.
3. A generic car of the same body type in neutral grey, e.g. `generic-bakkie-double-cab-neutral`.

So the generics matter most: they cover every car on day one.

## Style rules (apply to every image)

**View and framing**
- Front three-quarter view, the car's front pointing **left**, camera slightly above bonnet height (about 15 degrees). Same angle and same lens for every vehicle.
- Canvas **16:10**. The vehicle fills 84% of the width, centred, with the wheels standing on the same ground line, 12% up from the bottom edge.
- Every vehicle is scaled to fill the width, whatever its real size, so a minibus and a hatchback sit side by side neatly in a list.

**Rendering**
- Clean, semi-realistic 3D render, like the car pictures in ride-hailing apps. Not a photo, not a cartoon.
- Soft studio light from the top left, gentle highlights on the paint, no reflections of buildings, sky or people.
- Dark tinted windows: no interior and no people visible.
- The current generation sold in South Africa (2024 to 2026), with the wheels that model normally has.
- A soft contact shadow under the car, black at about 20% opacity, so it sits on both light and dark backgrounds.
- Transparent background.

**Accuracy**
- Each model must be recognisable at 64 px from its shape alone: grille, headlights, roofline and proportions.
- Bakkies: single cab and double cab are different images, because guards and police tell them apart.

**Avoid**
- Manufacturer badges, logos, emblems and model names. Suggest the grille's shape, never the badge.
- Number plates. Leave the plate area as plain body.
- Licence discs, dealer stickers, roof racks, tow bars, aftermarket wheels or body kits.
- Police, ambulance, taxi-association or company livery, and the Red Cross, Red Crescent or Star of Life.
- People, drivers or passengers.

**Files**
- A **master** PNG, 1600 × 1000, sRGB, with transparency.
- An **app** WebP, 480 × 300, quality 80, aim for 25 KB or less.
- File names exactly as in this brief: lower case, words joined by hyphens, `{make}-{model}-{colour}`, or `{make}-{model}-{body}-{colour}` where a model has more than one body. For example `vw-polo-vivo-black.webp` and `toyota-hilux-single-cab-white.webp`.

## Paint colours

Use these exact colours. The names are the English names that licence discs print.

| Colour | File name | Paint | Finish |
|---|---|---|---|
| White | `white` | `#F4F5F2` | gloss |
| Silver | `silver` | `#C3C7CB` | metallic |
| Grey | `grey` | `#6E7378` | metallic |
| Black | `black` | `#1C1D1F` | gloss |
| Red | `red` | `#B3202A` | gloss |
| Blue | `blue` | `#1F4E99` | metallic |
| Green | `green` | `#2F6B3A` | metallic |
| Beige | `beige` | `#D8C9A8` | gloss |
| Brown | `brown` | `#6B4A32` | metallic |
| Yellow | `yellow` | `#E8C21C` | gloss |
| Orange | `orange` | `#E0701F` | gloss |
| Gold | `gold` | `#B8975A` | metallic |
| Maroon | `maroon` | `#6E1F2B` | metallic |
| Neutral (fallback) | `neutral` | `#9AA0A6` | matte, slightly flat, so it reads as "colour unknown" |

- **Generics:** all 14, including neutral.
- **Models:** the first six only (white, silver, grey, black, red, blue). These are most of the cars on South African roads. Other colours fall back to the generic.

## Priority

- **P1:** the generics and the first list of models. Deliver these first.
- **P2:** the second list of models.
- **Later:** older generations that are still everywhere on the road. We'll send that list once P1 is in use.

## 1. Generic body types (P1, all 14 colours)

| Body type | File name | Shape to aim for |
|---|---|---|
| Hatchback | `generic-hatchback` | Small five-door city car |
| Sedan | `generic-sedan` | Mid-size four-door with a boot |
| Small SUV | `generic-suv-small` | Compact crossover |
| Large SUV | `generic-suv-large` | Seven-seat, tall and boxy |
| MPV | `generic-mpv` | Seven-seat people carrier |
| Bakkie, single cab | `generic-bakkie-single-cab` | Pick-up with a two-door cab and a long load bed |
| Bakkie, double cab | `generic-bakkie-double-cab` | Pick-up with a four-door cab and a short load bed |
| Minibus taxi | `generic-minibus` | High-roof 16-seat minibus |
| Panel van | `generic-panel-van` | Delivery van with no side windows behind the doors |
| Light truck | `generic-truck-light` | Small delivery truck with a box body |
| Heavy truck | `generic-truck-heavy` | Large rigid truck with a box body |
| Motorbike | `generic-motorbike` | Delivery scooter with a top box, shown from the same angle |

That's 12 body types × 14 colours = 168 images.

## 2. Models, first list (P1, six colours each)

| Make | Model | File name |
|---|---|---|
| Toyota | Hilux, single cab | `toyota-hilux-single-cab` |
| Toyota | Hilux, double cab | `toyota-hilux-double-cab` |
| Toyota | Corolla Cross | `toyota-corolla-cross` |
| Toyota | Corolla Quest | `toyota-corolla-quest` |
| Toyota | Fortuner | `toyota-fortuner` |
| Toyota | Starlet | `toyota-starlet` |
| Toyota | Quantum, minibus taxi | `toyota-quantum-minibus` |
| Volkswagen | Polo Vivo | `vw-polo-vivo` |
| Volkswagen | Polo | `vw-polo` |
| Ford | Ranger, single cab | `ford-ranger-single-cab` |
| Ford | Ranger, double cab | `ford-ranger-double-cab` |
| Nissan | NP200 | `nissan-np200` |
| Suzuki | Swift | `suzuki-swift` |
| Suzuki | Dzire | `suzuki-dzire` |
| Suzuki | Ertiga | `suzuki-ertiga` |
| Hyundai | Grand i10 | `hyundai-grand-i10` |
| Renault | Kwid | `renault-kwid` |
| Kia | Picanto | `kia-picanto` |
| Isuzu | D-Max, double cab | `isuzu-d-max-double-cab` |
| Mahindra | Pik Up, double cab | `mahindra-pik-up-double-cab` |
| Haval | Jolion | `haval-jolion` |
| Chery | Tiggo 4 Pro | `chery-tiggo-4-pro` |
| BMW | 3 Series | `bmw-3-series` |
| Mercedes-Benz | C-Class | `mercedes-c-class` |

That's 24 models × 6 colours = 144 images.

## 3. Models, second list (P2, six colours each)

| Make | Model | File name |
|---|---|---|
| Toyota | Corolla (sedan) | `toyota-corolla` |
| Toyota | Urban Cruiser | `toyota-urban-cruiser` |
| Toyota | Vitz | `toyota-vitz` |
| Toyota | Agya | `toyota-agya` |
| Toyota | Quantum, panel van | `toyota-quantum-panel-van` |
| Toyota | Land Cruiser 79, single cab | `toyota-land-cruiser-79-single-cab` |
| Toyota | RAV4 | `toyota-rav4` |
| Volkswagen | T-Cross | `vw-t-cross` |
| Volkswagen | Tiguan | `vw-tiguan` |
| Volkswagen | Amarok, double cab | `vw-amarok-double-cab` |
| Volkswagen | Golf | `vw-golf` |
| Ford | EcoSport | `ford-ecosport` |
| Ford | Everest | `ford-everest` |
| Nissan | Navara, double cab | `nissan-navara-double-cab` |
| Nissan | Almera | `nissan-almera` |
| Nissan | Magnite | `nissan-magnite` |
| Nissan | NV350 Impendulo, minibus | `nissan-nv350-minibus` |
| Suzuki | Celerio | `suzuki-celerio` |
| Suzuki | Baleno | `suzuki-baleno` |
| Suzuki | Fronx | `suzuki-fronx` |
| Suzuki | Jimny | `suzuki-jimny` |
| Hyundai | i20 | `hyundai-i20` |
| Hyundai | Venue | `hyundai-venue` |
| Hyundai | Creta | `hyundai-creta` |
| Kia | Sonet | `kia-sonet` |
| Renault | Kiger | `renault-kiger` |
| Renault | Triber | `renault-triber` |
| Renault | Duster | `renault-duster` |
| Isuzu | D-Max, single cab | `isuzu-d-max-single-cab` |
| Mahindra | Pik Up, single cab | `mahindra-pik-up-single-cab` |
| Haval | H6 | `haval-h6` |
| Chery | Tiggo 7 Pro | `chery-tiggo-7-pro` |
| GWM | P-Series, double cab | `gwm-p-series-double-cab` |
| BMW | X3 | `bmw-x3` |
| Mercedes-Benz | Sprinter, panel van | `mercedes-sprinter-panel-van` |
| Audi | A3 | `audi-a3` |
| Mitsubishi | Triton, double cab | `mitsubishi-triton-double-cab` |
| Mazda | CX-5 | `mazda-cx-5` |
| Honda | Amaze | `honda-amaze` |
| Land Rover | Defender | `land-rover-defender` |

That's 40 models × 6 colours = 240 images.

## Checklist before delivery

- [ ] Same angle, light and ground line in every image. Put three side by side and check.
- [ ] Each model is recognisable at 64 px wide.
- [ ] No badges, logos, plates or people anywhere.
- [ ] Paint matches the colour table.
- [ ] Every file is named exactly as listed, as a master PNG and an app WebP.
