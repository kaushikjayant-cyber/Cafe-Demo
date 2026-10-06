## Brand & Style

The design system embodies the convergence of traditional Japanese kissaten culture and Scandinavian functional minimalism. It honors quiet craftsmanship, slow hospitality, and considered utilitarianism. 

Every surface feels physical, rooted in tactile materials: textured handmade paper, polished stone counters, warm ceramics, and oiled cast iron. The aesthetic avoids cold tech tropes, harsh neons, and generic SaaS gradients in favor of organic stability, generous spatial framing, and precise typography.

The target audience encompasses barista artisans, front-of-house hospitality teams operating under peak cafe rushes, and discerning patrons reviewing table tabs or origin-specific tasting profiles. The emotional signature is calm precision: composed, grounded, unhurried, yet ruthlessly functional under rapid touch interaction.

## Layout & Spacing

The interface balances strict alignment with natural pauses (the Japanese concept of *Ma*—negative space). 

- **Grid Architecture:** 
  - **Counter POS (Tablet/Landscape Desktop):** An asymmetrical split layout. Left/main area (60-70% width) hosts menu categories and item matrix on a 3-to-4 column responsive card grid. Right area (30-40% width) anchors the current active order receipt and payment console.
  - **Handheld / Mobile Order Pad:** A single-column vertical flow with sticky bottom action trays for ticket dispatch and table switching.
- **Touch-First Sizing:** All touch targets maintain a minimum dimension of `48px × 48px` with at least `8px` (`space-sm`) clearance to avoid mis-taps during rush-hour order input.
- **Rhythm:** Modular increments based on a clean 4px/8px baseline scale. Content grouping utilizes clear internal padding (`space-md` or `space-lg`) paired with hair-thin borders rather than deep nested indentation.

## Elevation & Depth

This system intentionally rejects dramatic drop shadows, heavy blur filters, and neon glows. Depth is achieved entirely through natural surface layering and structural lines:

- **Layer 0 (Canvas Base):** `#FBF9F5` serves as the primary room floor and broad reading canvas.
- **Layer 1 (Card & Modular Modules):** `#F3EFEA` provides a tactile, elevated plane for interactive tiles, order cards, and keypad buttons.
- **Layer 2 (Overlays, Flyouts & Modals):** Pure white `#FFFFFF` or pristine `#FBF9F5` surrounded by a crisp `1px solid #E5DFD7` boundary.
- **Ambient Shadow System:** When an element floats (e.g., active drag-and-drop order reordering or active checkout modal), it receives a soft, sunlit contact shadow: `box-shadow: 0 4px 20px -2px rgba(28, 25, 23, 0.05), 0 2px 6px -1px rgba(28, 25, 23, 0.03)`.

## Components

### Buttons
- **Primary Action (Charge / Confirm Order):** Background `#1C1917`, text `#FBF9F5`, border `none`, corner radius `rounded` (`0.25rem`). Active state subtly shifts to `#2E2A27` with a slight touch compression (`scale(0.99)`).
- **Secondary Action (Add Modifier / Split Bill):** Background `#F3EFEA`, text `#1C1917`, border `1px solid #E5DFD7`. Hover/Active: Background `#EBE5DD`.
- **Destructive / Void Action:** Background transparent, text `#C25E3E`, border `1px solid #C25E3E`.

### Cards & Menu Tiles
- **Drink / Origin Item Tile:** Background `#F3EFEA`, border `1px solid #E5DFD7`, internal padding `space-md`. Displays item title in `Newsreader`, gram weight / roast level in `label-sm`, and price right-aligned in tabular `Plus Jakarta Sans`. When out of stock, surface drops opacity to `50%` with a subtle diagonal strike tag.

### Chips & Origin Badges
- Compact pill-shaped modules (`height: 24px` or `28px`).
- **Standard Attribute (Washed / Natural / Varietal):** Background `#EBE5DD`, text `#78716C`.
- **Status (Ready for Pickup / Fulfilled):** Background `rgba(74, 107, 93, 0.12)`, text `#4A6B5D`, dot indicator `4px` solid sage green.
- **Priority (Rush / High Heat / VIP Table):** Background `rgba(194, 94, 62, 0.12)`, text `#C25E3E`.

### Inputs & Numpads
- **Search & Modifier Notes:** Background `#FFFFFF`, border `1px solid #E5DFD7`, corner radius `0.25rem`. Focused state shifts border to `#1C1917` without thick external focus rings.
- **Tender Numpad Keys:** Large `64px` height blocks, background `#F3EFEA`, border `1px solid #E5DFD7`, font `Plus Jakarta Sans` `24px` tabular numbers.

### Lists & Receipts
- Line items are separated by `1px solid #E5DFD7`. Modifier rows (e.g., *Oat Mlk +$0.80*, *Single Origin Bourbon*) indent by `space-md` with `body-sm` text colored in `#78716C`. Total block anchored at bottom with high-contrast `headline-sm` sum.

### Specialty Domain Components
- **Origin Profile Stamp:** A boxed stamp component mimicking artisan packaging, displaying Elevation (MASL), Varietal, Region, and Flavor Notes in a structured 2x2 micro-grid.
- **Extraction Timer Widget:** Clean tabular timer for manual pourovers, using `#1C1917` with a thin `#C25E3E` second hand indicator.

{
 "displayName": "Japandi Specialty Coffee Point of Sale",
 "theme": {
  "colorMode": "LIGHT",
  "font": "NEWSREADER",
  "roundness": "ROUND_FOUR",
  "customColor": "#1c1917",
  "headlineFont": "NEWSREADER",
  "bodyFont": "PLUS_JAKARTA_SANS",
  "labelFont": "PLUS_JAKARTA_SANS",
  "namedColors": {
   "primary_fixed": "#e9e1dd",
   "on_primary_fixed_variant": "#4a4643",
   "tertiary_container": "#002116",
   "surface_container_lowest": "#ffffff",
   "secondary_fixed_dim": "#ffb59e",
   "on_secondary": "#ffffff",
   "on_tertiary_container": "#698b7c",
   "error": "#ba1a1a",
   "surface_bright": "#fbf9f5",
   "background": "#fbf9f5",
   "surface_container_high": "#eae8e4",
   "surface_container": "#efeeea",
   "secondary_container": "#fd8c68",
   "outline_variant": "#d0c4be",
   "on_secondary_fixed": "#3a0b00",
   "on_secondary_container": "#742508",
   "secondary": "#9d4225",
   "on_secondary_fixed_variant": "#7e2c10",
   "on_tertiary_fixed": "#002116",
   "primary": "#000000",
   "surface_dim": "#dbdad6",
   "on_error_container": "#93000a",
   "surface": "#fbf9f5",
   "surface_container_highest": "#e4e2de",
   "inverse_primary": "#ccc5c2",
   "surface_tint": "#625d5b",
   "primary_fixed_dim": "#ccc5c2",
   "tertiary": "#000000",
   "surface_variant": "#e4e2de",
   "surface_container_low": "#f5f3ef",
   "on_surface_variant": "#4d4540",
   "on_primary_container": "#888380",
   "secondary_fixed": "#ffdbd0",
   "outline": "#7e7570",
   "error_container": "#ffdad6",
   "tertiary_fixed_dim": "#abcebe",
   "on_error": "#ffffff",
   "on_tertiary_fixed_variant": "#2d4d40",
   "inverse_on_surface": "#f2f0ed",
   "on_tertiary": "#ffffff",
   "primary_container": "#1e1b19",
   "on_surface": "#1b1c1a",
   "on_primary_fixed": "#1e1b19",
   "on_primary": "#ffffff",
   "inverse_surface": "#30312e",
   "tertiary_fixed": "#c6ebd9",
   "on_background": "#1b1c1a"
  },
  "designMd": "---\nname: Japandi Specialty Coffee Point of Sale\ncolors:\n  surface: '#fbf9f5'\n  surface-dim: '#dbdad6'\n  surface-bright: '#fbf9f5'\n  surface-container-lowest: '#ffffff'\n  surface-container-low: '#f5f3ef'\n  surface-container: '#efeeea'\n  surface-container-high: '#eae8e4'\n  surface-container-highest: '#e4e2de'\n  on-surface: '#1b1c1a'\n  on-surface-variant: '#4d4540'\n  inverse-surface: '#30312e'\n  inverse-on-surface: '#f2f0ed'\n  outline: '#7e7570'\n  outline-variant: '#d0c4be'\n  surface-tint: '#625d5b'\n  primary: '#000000'\n  on-primary: '#ffffff'\n  primary-container: '#1e1b19'\n  on-primary-container: '#888380'\n  inverse-primary: '#ccc5c2'\n  secondary: '#9d4225'\n  on-secondary: '#ffffff'\n  secondary-container: '#fd8c68'\n  on-secondary-container: '#742508'\n  tertiary: '#000000'\n  on-tertiary: '#ffffff'\n  tertiary-container: '#002116'\n  on-tertiary-container: '#698b7c'\n  error: '#ba1a1a'\n  on-error: '#ffffff'\n  error-container: '#ffdad6'\n  on-error-container: '#93000a'\n  primary-fixed: '#e9e1dd'\n  primary-fixed-dim: '#ccc5c2'\n  on-primary-fixed: '#1e1b19'\n  on-primary-fixed-variant: '#4a4643'\n  secondary-fixed: '#ffdbd0'\n  secondary-fixed-dim: '#ffb59e'\n  on-secondary-fixed: '#3a0b00'\n  on-secondary-fixed-variant: '#7e2c10'\n  tertiary-fixed: '#c6ebd9'\n  tertiary-fixed-dim: '#abcebe'\n  on-tertiary-fixed: '#002116'\n  on-tertiary-fixed-variant: '#2d4d40'\n  background: '#fbf9f5'\n  on-background: '#1b1c1a'\n  surface-variant: '#e4e2de'\ntypography:\n  headline-xl:\n    fontFamily: Newsreader\n    fontSize: 48px\n    fontWeight: '400'\n    lineHeight: 56px\n  headline-xl-mobile:\n    fontFamily: Newsreader\n    fontSize: 32px\n    fontWeight: '400'\n    lineHeight: 40px\n  headline-lg:\n    fontFamily: Newsreader\n    fontSize: 36px\n    fontWeight: '400'\n    lineHeight: 44px\n  headline-lg-mobile:\n    fontFamily: Newsreader\n    fontSize: 26px\n    fontWeight: '400'\n    lineHeight: 34px\n  headline-md:\n    fontFamily: Newsreader\n    fontSize: 24px\n    fontWeight: '500'\n    lineHeight: 32px\n  headline-sm:\n    fontFamily: Newsreader\n    fontSize: 20px\n    fontWeight: '500'\n    lineHeight: 28px\n  body-lg:\n    fontFamily: Plus Jakarta Sans\n    fontSize: 18px\n    fontWeight: '400'\n    lineHeight: 28px\n  body-md:\n    fontFamily: Plus Jakarta Sans\n    fontSize: 15px\n    fontWeight: '400'\n    lineHeight: 22px\n  body-sm:\n    fontFamily: Plus Jakarta Sans\n    fontSize: 13px\n    fontWeight: '400'\n    lineHeight: 18px\n  label-lg:\n    fontFamily: Plus Jakarta Sans\n    fontSize: 14px\n    fontWeight: '600'\n    lineHeight: 20px\n  label-md:\n    fontFamily: Plus Jakarta Sans\n    fontSize: 12px\n    fontWeight: '600'\n    lineHeight: 16px\n  label-sm:\n    fontFamily: Plus Jakarta Sans\n    fontSize: 11px\n    fontWeight: '600'\n    lineHeight: 14px\nrounded:\n  sm: 0.125rem\n  DEFAULT: 0.25rem\n  md: 0.375rem\n  lg: 0.5rem\n  xl: 0.75rem\n  full: 9999px\nspacing:\n  gutter: 1rem\n  gutter-desktop: 1.5rem\n  margin: 1rem\n  margin-desktop: 2rem\n  space-xs: 0.25rem\n  space-sm: 0.5rem\n  space-md: 1rem\n  space-lg: 1.5rem\n  space-xl: 2.5rem\n---\n\n## Brand & Style\n\nThe design system embodies the convergence of traditional Japanese kissaten culture and Scandinavian functional minimalism. It honors quiet craftsmanship, slow hospitality, and considered utilitarianism. \n\nEvery surface feels physical, rooted in tactile materials: textured handmade paper, polished stone counters, warm ceramics, and oiled cast iron. The aesthetic avoids cold tech tropes, harsh neons, and generic SaaS gradients in favor of organic stability, generous spatial framing, and precise typography.\n\nThe target audience encompasses barista artisans, front-of-house hospitality teams operating under peak cafe rushes, and discerning patrons reviewing table tabs or origin-specific tasting profiles. The emotional signature is calm precision: composed, grounded, unhurried, yet ruthlessly functional under rapid touch interaction.\n\n## Colors\n\nThe palette derives from natural cafe substrates and materials:\n\n- **Primary (`#1C1917` - Deep Espresso Charcoal):** Grounded base for structural frames, high-impact buttons, and primary editorial typography. Never use pure `#000000`.\n- **Secondary (`#C25E3E` - Roasted Cinnamon / Terracotta):** Reserved for intentional focal points—active tabs, selected extraction profiles, urgent order alerts, and seasonal origin badges.\n- **Tertiary (`#4A6B5D` - Muted Sage Green):** Functional state indicator for fulfilled drinks, open tables, organic certifications, and payment confirmations.\n- **Neutral Canvas (`#FBF9F5` - Warm Cream Paper):** The foundational wash resembling uncoated, sunlit paper stock.\n- **Surface Elevation (`#F3EFEA` - Warm Sandstone):** Sits directly atop the canvas for order cards, ticket queues, and modular trays.\n- **Dividers & Strokes (`#E5DFD7` - Washed Ash):** Ultra-subtle, crisp 1px delineation lines that give architectural framing without visual noise.\n- **Muted Text (`#78716C` - Warmed Slate Charcoal):** Secondary descriptors, tasting notes, ingredient weights, and historical timestamps.\n\n## Typography\n\nThe typography pairs the literary elegance of an editorial serif (`Newsreader`) with the unyielding geometric clarity of a modern grotesque (`Plus Jakarta Sans`).\n\n- **Display & Headings (Newsreader):** Brings warmth and historical weight to category headings (e.g., *Pourover Origins*, *Single Lot Reserves*), screen headers, and modal titles. Always set at regular (`400`) or medium (`500`) weight; never bold. Use italic variants sparingly for sensory notes (e.g., *jasmine, bergamot, candied peach*).\n- **Body & Metrics (Plus Jakarta Sans):** Pure ergonomic utility. Numbers, POS item prices, stock counts, batch timers, and table IDs use proportional or tabular numerals for effortless legibility across glancing distances.\n- **Letter Spacing:** Headlines utilize slightly relaxed tracking (`-0.01em` to normal). Small utility labels (`label-sm`, `label-md`) use uppercase formatting paired with widened tracking (`+0.05em`) for quick visual scanning on hardware screens.\n\n## Layout & Spacing\n\nThe interface balances strict alignment with natural pauses (the Japanese concept of *Ma*—negative space). \n\n- **Grid Architecture:** \n  - **Counter POS (Tablet/Landscape Desktop):** An asymmetrical split layout. Left/main area (60-70% width) hosts menu categories and item matrix on a 3-to-4 column responsive card grid. Right area (30-40% width) anchors the current active order receipt and payment console.\n  - **Handheld / Mobile Order Pad:** A single-column vertical flow with sticky bottom action trays for ticket dispatch and table switching.\n- **Touch-First Sizing:** All touch targets maintain a minimum dimension of `48px × 48px` with at least `8px` (`space-sm`) clearance to avoid mis-taps during rush-hour order input.\n- **Rhythm:** Modular increments based on a clean 4px/8px baseline scale. Content grouping utilizes clear internal padding (`space-md` or `space-lg`) paired with hair-thin borders rather than deep nested indentation.\n\n## Elevation & Depth\n\nThis system intentionally rejects dramatic drop shadows, heavy blur filters, and neon glows. Depth is achieved entirely through natural surface layering and structural lines:\n\n- **Layer 0 (Canvas Base):** `#FBF9F5` serves as the primary room floor and broad reading canvas.\n- **Layer 1 (Card & Modular Modules):** `#F3EFEA` provides a tactile, elevated plane for interactive tiles, order cards, and keypad buttons.\n- **Layer 2 (Overlays, Flyouts & Modals):** Pure white `#FFFFFF` or pristine `#FBF9F5` surrounded by a crisp `1px solid #E5DFD7` boundary.\n- **Ambient Shadow System:** When an element floats (e.g., active drag-and-drop order reordering or active checkout modal), it receives a soft, sunlit contact shadow: `box-shadow: 0 4px 20px -2px rgba(28, 25, 23, 0.05), 0 2px 6px -1px rgba(28, 25, 23, 0.03)`.\n\n## Shapes\n\nThe geometry balances soft hand-finished corners with structured discipline:\n\n- **Containers & Surfaces:** Modest corner radius (`0.25rem` to `0.5rem`). Cards, inputs, and operational blocks feel like milled stone tiles or pressed cardboard—tangible, not hyper-rounded.\n- **Pills for Metas & Badges:** Distinctive full-pill shapes (`rounded-full`) are reserved exclusively for contextual indicators: table numbers, extraction tags (e.g., *V60*, *Aeropress*, *Batch Brew*), order state labels, and modifier badges. This creates an immediate cognitive distinction between structural panels and interactive metadata tags.\n\n## Components\n\n### Buttons\n- **Primary Action (Charge / Confirm Order):** Background `#1C1917`, text `#FBF9F5`, border `none`, corner radius `rounded` (`0.25rem`). Active state subtly shifts to `#2E2A27` with a slight touch compression (`scale(0.99)`).\n- **Secondary Action (Add Modifier / Split Bill):** Background `#F3EFEA`, text `#1C1917`, border `1px solid #E5DFD7`. Hover/Active: Background `#EBE5DD`.\n- **Destructive / Void Action:** Background transparent, text `#C25E3E`, border `1px solid #C25E3E`.\n\n### Cards & Menu Tiles\n- **Drink / Origin Item Tile:** Background `#F3EFEA`, border `1px solid #E5DFD7`, internal padding `space-md`. Displays item title in `Newsreader`, gram weight / roast level in `label-sm`, and price right-aligned in tabular `Plus Jakarta Sans`. When out of stock, surface drops opacity to `50%` with a subtle diagonal strike tag.\n\n### Chips & Origin Badges\n- Compact pill-shaped modules (`height: 24px` or `28px`).\n- **Standard Attribute (Washed / Natural / Varietal):** Background `#EBE5DD`, text `#78716C`.\n- **Status (Ready for Pickup / Fulfilled):** Background `rgba(74, 107, 93, 0.12)`, text `#4A6B5D`, dot indicator `4px` solid sage green.\n- **Priority (Rush / High Heat / VIP Table):** Background `rgba(194, 94, 62, 0.12)`, text `#C25E3E`.\n\n### Inputs & Numpads\n- **Search & Modifier Notes:** Background `#FFFFFF`, border `1px solid #E5DFD7`, corner radius `0.25rem`. Focused state shifts border to `#1C1917` without thick external focus rings.\n- **Tender Numpad Keys:** Large `64px` height blocks, background `#F3EFEA`, border `1px solid #E5DFD7`, font `Plus Jakarta Sans` `24px` tabular numbers.\n\n### Lists & Receipts\n- Line items are separated by `1px solid #E5DFD7`. Modifier rows (e.g., *Oat Mlk +$0.80*, *Single Origin Bourbon*) indent by `space-md` with `body-sm` text colored in `#78716C`. Total block anchored at bottom with high-contrast `headline-sm` sum.\n\n### Specialty Domain Components\n- **Origin Profile Stamp:** A boxed stamp component mimicking artisan packaging, displaying Elevation (MASL), Varietal, Region, and Flavor Notes in a structured 2x2 micro-grid.\n- **Extraction Timer Widget:** Clean tabular timer for manual pourovers, using `#1C1917` with a thin `#C25E3E` second hand indicator.",
  "colorVariant": "FIDELITY",
  "overridePrimaryColor": "#1c1917",
  "overrideSecondaryColor": "#c25e3e",
  "overrideTertiaryColor": "#4a6b5d",
  "overrideNeutralColor": "#fbf9f5",
  "spacingScale": 2,
  "typography": {
   "body-sm": {
    "fontFamily": "Plus Jakarta Sans",
    "fontSize": "13px",
    "fontWeight": "400",
    "lineHeight": "18px"
   },
   "label-sm": {
    "fontFamily": "Plus Jakarta Sans",
    "fontSize": "11px",
    "fontWeight": "600",
    "lineHeight": "14px"
   },
   "headline-xl": {
    "fontFamily": "Newsreader",
    "fontSize": "48px",
    "fontWeight": "400",
    "lineHeight": "56px"
   },
   "body-md": {
    "fontFamily": "Plus Jakarta Sans",
    "fontSize": "15px",
    "fontWeight": "400",
    "lineHeight": "22px"
   },
   "body-lg": {
    "fontFamily": "Plus Jakarta Sans",
    "fontSize": "18px",
    "fontWeight": "400",
    "lineHeight": "28px"
   },
   "headline-lg": {
    "fontFamily": "Newsreader",
    "fontSize": "36px",
    "fontWeight": "400",
    "lineHeight": "44px"
   },
   "headline-sm": {
    "fontFamily": "Newsreader",
    "fontSize": "20px",
    "fontWeight": "500",
    "lineHeight": "28px"
   },
   "headline-md": {
    "fontFamily": "Newsreader",
    "fontSize": "24px",
    "fontWeight": "500",
    "lineHeight": "32px"
   },
   "headline-xl-mobile": {
    "fontFamily": "Newsreader",
    "fontSize": "32px",
    "fontWeight": "400",
    "lineHeight": "40px"
   },
   "label-md": {
    "fontFamily": "Plus Jakarta Sans",
    "fontSize": "12px",
    "fontWeight": "600",
    "lineHeight": "16px"
   },
   "headline-lg-mobile": {
    "fontFamily": "Newsreader",
    "fontSize": "26px",
    "fontWeight": "400",
    "lineHeight": "34px"
   },
   "label-lg": {
    "fontFamily": "Plus Jakarta Sans",
    "fontSize": "14px",
    "fontWeight": "600",
    "lineHeight": "20px"
   }
  },
  "spacing": {
   "space-xs": "0.25rem",
   "space-md": "1rem",
   "gutter-desktop": "1.5rem",
   "margin": "1rem",
   "gutter": "1rem",
   "margin-desktop": "2rem",
   "space-lg": "1.5rem",
   "space-sm": "0.5rem",
   "space-xl": "2.5rem"
  },
  "headlineFontFamily": "Newsreader",
  "bodyFontFamily": "Plus Jakarta Sans",
  "labelFontFamily": "Plus Jakarta Sans"
 }
}