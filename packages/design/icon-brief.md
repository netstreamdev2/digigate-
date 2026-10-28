# DigiGate icon brief

DigiGate is a security system for boom-gated sites: hospitals first, then residential estates. Guards use a rugged Android handheld at the gate to scan drivers' licences and vehicle licence discs on entry and exit. The system flags anything suspicious, for example a driver leaving in a different car from the one they arrived in. Security managers watch everything live on a web dashboard.

This brief lists every icon the product needs and how each should look. All icons should feel like one hand-made family: precise, calm and professional. Nothing should look generic or clip-art.

## Style rules (apply to every icon)

**Grid and weight**
- 24 × 24 px grid with 2 px padding (20 × 20 live area). viewBox `0 0 24 24`.
- Outline style, 1.75 px stroke at 24 px, rounded caps and joins, 2 px corner radius on rectangles.
- Must stay crisp and readable at **20 px** (dashboard) and **64 px** (gate app, where guards read it at arm's length in direct sunlight).
- Each icon in sections 7 and 8 also needs a **filled** variant (`<name>-filled`) for selected and active states.

**Status icons are different on purpose.** The four icons in section 5 are bold and filled, with the symbol knocked out. Each has its own **shape**, so a guard can tell them apart without relying on colour: circle = clear, triangle = warning, octagon = blocked, circle with "i" = info.

**Files**
- SVG, single colour (`#000000`; the app recolours it), strokes converted to filled outlines, no text, no gradients, no embedded images, paths optimised.
- File names exactly as listed, in kebab-case.

**Avoid**
- Red Cross or Red Crescent emblems and the Star of Life. They are legally protected. Medical and emergency meanings use other imagery (see `emergency`).
- The SA coat of arms, flags, government insignia, or any copy of the real licence card, licence disc or ID artwork. Suggest the shape of the document, never reproduce it.
- Real brand logos.
- People that look like a specific gender or race, and stereotyped job imagery (no aprons, mops or uniforms for cleaners or domestic workers).
- Letters and numbers inside icons, except the "P" in `parking`, which is a standard road-sign glyph.

**Brand reference**
- The current logo is navy: `#062C65` and `#112D76`.
- Icon weight and corner rounding should sit comfortably beside the logo mark.
- The final colour palette comes with the design system. Icons themselves stay single-colour.

## Priority

- **P1:** first build of the gate app
- **P2:** dashboard
- **P4:** estates
- **Later:** planned features

Deliver P1 first.

## 1. App identity (P1, except where marked)

These are PNGs, not 24 px SVGs.

| File | Used for | How it looks |
|---|---|---|
| `app-icon.png` | Android launcher icon | DigiGate logo mark on a solid brand background. 1024 × 1024. Keep the mark inside the centre 66%, because Android crops icons to circles and rounded squares |
| `android-icon-foreground.png` | Adaptive icon, top layer | Mark only, transparent background, inside the centre 66%. 1024 × 1024 |
| `android-icon-background.png` | Adaptive icon, bottom layer | Solid brand colour or a very subtle texture, with no detail near the edges. 1024 × 1024 |
| `android-icon-monochrome.png` | Android themed icons | Single-colour silhouette of the mark on transparent. 1024 × 1024 |
| `splash-icon.png` | Splash screen while the app starts | Mark only, transparent. 1024 × 1024 |
| `notification-icon.png` (Later) | Android status-bar notifications | Pure white silhouette of the mark on transparent, no fine detail. 96 × 96 |
| `favicon.ico`, `icon.svg`, `apple-icon.png` (P2) | Dashboard browser tab | Mark simplified so it reads at 16 px. `.ico` with 16 and 32 px sizes; `apple-icon` 180 × 180 |

## 2. Scanning and documents (P1)

| File | Used for | How it looks |
|---|---|---|
| `scan` | "Ready to scan" and the scan button; also the large idle-screen hero | Barcode inside four corner brackets, with a horizontal scan line across it |
| `licence-card` | Driver's licence | Landscape card: photo block on the left, three text lines on the right. No chip |
| `licence-disc` | Vehicle licence disc | Circle with a subtle serrated edge, small barcode block inside |
| `id-card` | Smart ID card | Landscape card with photo block and a small chip rectangle, so it reads differently from `licence-card` |
| `id-book` | Green ID book | Closed booklet, spine on the left |
| `manual-entry` | Type the details by hand | Pen resting on a form line |
| `camera` | Take a photo | Camera body with lens |
| `rescan` | Scan again | Corner brackets with a circular arrow inside |
| `scan-failed` | Barcode couldn't be read | Corner brackets around a broken barcode |

## 3. Vehicles and people (P1)

| File | Used for | How it looks |
|---|---|---|
| `vehicle` | A car | Simple sedan, side view |
| `number-plate` | Number plate | Wide rounded rectangle with blank character blocks, no real letters |
| `occupants` | People in the car | Three heads and shoulders in a row, the front one overlapping |
| `driver` | The driver | Person behind a steering wheel |
| `co-driver` | Extra authorised driver for this visit | `driver` with a small "+" badge |
| `pedestrian` | Walk-in visitor | Person walking, side view, mid-stride |
| `visitor` | Visitor | Person with a small pass clipped at the chest |
| `staff` | Registered staff member | Person with an ID badge on a lanyard |
| `staff-pending` | Staff awaiting admin approval | `staff` with a small clock badge |
| `contractor` | Contractor | Hard hat |
| `delivery` | Delivery | Parcel box with tape line |
| `patient-dropoff` | Drop-off or pick-up | Car with a short downward arrow onto a kerb line. No medical symbols |
| `emergency` | Emergency vehicle | Vehicle with a light bar on the roof and short light rays |
| `unfamiliar-vehicle` | Registered person in a car we haven't seen them in | `vehicle` with a small "?" badge |

## 4. Gate and movement (P1)

| File | Used for | How it looks |
|---|---|---|
| `entry` | Coming in | Arrow passing a gate post, pointing in |
| `exit` | Going out | Mirror of `entry`, pointing out |
| `boom-gate-closed` | Boom down | Post with a horizontal arm |
| `boom-gate-open` | Boom up | Post with the arm raised to about 70° |
| `pedestrian-gate` | Pedestrian gate | Turnstile |
| `on-site` | Currently on site (live) | Map pin with a pulse ring |
| `duration` | Time on site | Clock face |
| `overstay` | Stayed too long | Hourglass with a small "!" badge |

## 5. Results (P1): bold, filled, shape-coded

These appear large (64 px or more) on the result screen the moment a scan finishes. They must be unmistakable in sunlight.

| File | Used for | How it looks |
|---|---|---|
| `result-clear` | Clear, boom can open | Filled circle with a knocked-out check mark |
| `result-warning` | Warning, guard must acknowledge | Filled triangle with rounded corners and a knocked-out "!" |
| `result-blocked` | Blocked, supervisor needed | Filled octagon with a knocked-out ✕ |
| `info` | Information only | Filled circle with a knocked-out "i" |
| `override` | Supervisor override | Shield with a key across it |

### Rule icons

These are small icons shown next to the reason for a warning or block, in outline style.

| File | Reason | How it looks |
|---|---|---|
| `rule-vehicle-swap` | Driver leaving in a different car | Two cars with swap arrows between them |
| `rule-unknown-driver` | Driver isn't the one who came in | `driver` with a "?" badge |
| `rule-walked-in-driving-out` | Came in on foot, leaving in a car | Walking person → arrow → car |
| `rule-no-entry-record` | Car leaving that never came in | `entry` arrow with a diagonal slash |
| `rule-plate-mismatch` | Plate doesn't match the disc | `number-plate` with a "≠" badge |
| `rule-clone` | Same plate or disc on two cars | Two identical plates, one offset behind the other |
| `rule-duplicate-entry` | Already inside | Two stacked `entry` arrows |
| `rule-expired` | Licence or disc expired | Calendar with a small ✕ badge |
| `rule-occupant-drop` | Fewer people leaving than came in | `occupants` with a "−" badge |

## 6. Guard session and device (P1)

| File | Used for | How it looks |
|---|---|---|
| `guard` | Guard | Person with a peaked cap |
| `supervisor` | Supervisor | `guard` with a small star badge |
| `pin` | PIN entry | 3 × 3 grid of dots |
| `lock` / `unlock` | App locked / unlocked | Padlock closed / open |
| `switch-guard` | Shift change | Two people with circular swap arrows |
| `sign-out` | Sign out | Door with an arrow leaving it |
| `offline` | No connection | Cloud with a diagonal slash |
| `synced` | Everything uploaded | Cloud with a check |
| `syncing` | Uploading now | Cloud with two circular arrows |
| `pending-upload` | Scans waiting to upload | Cloud with an up arrow |
| `device` | Handheld scanner | Rugged handheld: phone shape with a thick bumper and a scan window on top |

## 7. Dashboard navigation (P2), outline + `-filled` variants

| File | Used for | How it looks |
|---|---|---|
| `overview` | Home | 2 × 2 grid of rounded tiles |
| `visits` | Visit log | List rows, each with a small in/out arrow |
| `alerts` | Alerts | Bell with a small "!" badge |
| `people` | Registered people | Two people, one behind the other |
| `approvals` | Staff waiting for approval | Person with a check badge |
| `users` | Guard and user management | Person with a small gear badge |
| `sites` | Sites and gates | Building with a boom gate in front |
| `reports` | Reports | Document with a small bar chart |
| `audit-log` | Audit log | Shield with list lines inside |
| `settings` | Settings | Gear |
| `site-config` | Site rules and limits | Three horizontal sliders |

`on-site`, `vehicle` and `device` from earlier sections are reused in navigation and need `-filled` variants too.

## 8. Common interface (P1 and P2), outline + `-filled` variants where they toggle

`search`, `filter`, `sort`, `add` (plus), `remove` (minus), `edit` (pencil), `delete` (bin), `close` (✕), `back` (chevron left), `chevron-right`, `chevron-down`, `chevron-up`, `more` (three vertical dots), `menu` (three lines), `refresh`, `check`, `copy`, `download`, `upload`, `export` (box with an arrow leaving it), `calendar`, `date-range` (calendar with a range bar), `external-link`, `reveal` (eye), `masked` (eye with a slash), `help` (question mark in a circle), `bell`, `user` (single person, profile), `qr-code` (device pairing), `mfa` (phone with a small shield), `sign-in` (door with an arrow entering).

## 9. Estates (P4)

| File | Used for | How it looks |
|---|---|---|
| `resident` | Resident | Person in front of a house outline |
| `unit` | Unit or house being visited | House with a small blank plaque by the door |
| `invite` | Visitor pre-registration | Ticket with a QR block in one corner |
| `arrival-notification` | "Your visitor has arrived" | Phone with a bell |
| `worker` | Domestic worker or estate staff | Person with a small calendar badge. No uniform, apron or tools |
| `worker-permit` | Worker's allowed days and times | ID card with a calendar badge |
| `ehailing` | Uber or Bolt driver | Car with a location pin above it |

## 10. Later

| File | Used for | How it looks |
|---|---|---|
| `nfc-tap` | Tap a staff card | Card with three radio-wave arcs |
| `card-revoked` | Lost or stolen card | Card with a diagonal slash |
| `panic` | Silent duress alert | Siren light |
| `lockdown` | Site-wide lockdown | Padlock in front of a gate |
| `incident-pack` | Evidence pack for the police | Folder with a shield |
| `watchlist` | Banned people and vehicles | List with an eye |
| `parking` | Parking | Rounded square with a "P" |
| `evacuation` | Fire evacuation list | Person running through a doorway, in the style of standard emergency-exit signs |

## Before handing over

Check every icon at 20 px and 64 px, on light and dark backgrounds, and next to the others in its section. Within a section they should look like they were drawn by the same hand on the same day.
