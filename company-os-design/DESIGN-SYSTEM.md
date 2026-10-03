# Company OS - Design System

Light theme. Calm, dense, readable. One accent colour. Status is always shown with colour plus text, never colour alone.

## 1. Colour tokens

| Token | Hex | Use |
|---|---|---|
| bg | #F5F6F3 | App background |
| surface | #FFFFFF | Cards, sidebar, top bar, modals |
| surface-2 | #FAFBF9 | Table header, footer bars, inset panels |
| line | #E4E7E1 | Card and input borders |
| line-2 | #EEF0EC | Row dividers |
| ink | #151A1E | Primary text |
| ink-2 | #4A535B | Secondary text |
| ink-3 | #8A939B | Muted text, placeholders, table headers |
| primary | #0F6B5C | Primary buttons, active navigation, progress, active time |
| primary-dark | #0B5548 | Text on primary-soft |
| primary-soft | #E3F1EE | Active nav background, selected rows, focus ring |
| green / soft | #1E8E5A / #E4F4EB | Success, present, working, productive |
| amber / soft | #B26A00 / #FCF0DA | Warning, late, break, pending, idle (bar #E0921A) |
| red / soft | #C2362B / #FBE7E4 | Error, absent, overdue, unproductive, destructive |
| blue / soft | #2459C4 / #E6EDFB | Info, holiday, offline, break in timeline |
| violet / soft | #6B46C1 / #EEE8FA | Roles, leave, special stages |
| gray / soft | #5C666E / #ECEEEB | Neutral, disabled, weekly off (bar #B5BCC2) |

Status colour mapping (use everywhere):

| Meaning | Colour |
|---|---|
| Working, Present, Approved, Active, Success, Productive, OK | green |
| On break, Late, Pending, Idle, Warning | amber |
| Absent, Overdue, Rejected, Failed, Unproductive, Not started | red |
| Offline, Holiday, Info | blue |
| On leave, role badges | violet |
| Off shift, Disabled, Neutral, Weekly off | gray |

## 2. Typography

| Role | Font | Size / weight |
|---|---|---|
| UI text | IBM Plex Sans | 13px / 400, line height 1.45 |
| Labels, buttons, table cell emphasis | IBM Plex Sans | 12 to 13px / 600 |
| Page title (top bar) | IBM Plex Sans | 16px / 600 |
| Section and card title | IBM Plex Sans | 13px / 600 |
| Greeting, profile name | IBM Plex Sans | 17 to 22px / 600 |
| Table header | IBM Plex Sans | 11px / 600, uppercase, letter spacing 0.05em |
| Numbers, times, codes, permission keys | IBM Plex Mono, tabular figures | same size as context |
| KPI value | IBM Plex Mono | 24px / 600 |
| Shift timer | IBM Plex Mono | 20px sidebar, 30px dashboard / 600 |

All durations, clock times, counts, money, employee codes and IP addresses use the mono font so columns align.

## 3. Spacing, radius, elevation

| Item | Value |
|---|---|
| Base unit | 4px. Common gaps: 8, 10, 14, 20 |
| Page padding | 20px top and bottom, 22px sides |
| Card | radius 10px, 1px line border, shadow 0 1px 2px rgba(21,26,30,0.05), padding 16px |
| Grid gap between cards | 14px |
| Input and button | radius 8px. Input height 38px. Button padding 7px 12px, small 4px 9px, large 11px 18px |
| Badge | pill, 11.5px / 600, padding 2px 8px |
| Modal | radius 14px, width 480 to 620px, overlay rgba(21,26,30,0.38) |
| Drawer | right side, 520px wide |
| Table row | 10px 14px cell padding, 1px line-2 divider |
| Focus ring | 1px primary border + 3px primary-soft ring |

## 4. Layout

Desktop App (1280 x 800 minimum window):

- Custom title bar 34px: logo, app name, window controls.
- Sidebar 216px: brand, navigation with count pills, shift box pinned at the bottom (status dot, timer, Break and End Shift).
- Top bar 56px: page title, offline badge when offline, tracking status badge, bell, avatar.
- Content scrolls vertically. Sidebar and top bar stay fixed.

Admin Panel (1440 x 900 reference, responsive down to 1280):

- Sidebar 232px: brand with Admin tag, groups that expand to sub-items, current user at the bottom.
- Top bar 56px: breadcrumb above page title, global search, page actions, bell.
- Standard list page: filter row (segments left, filter chips and primary button right), then one table card with pagination footer.
- Standard detail page: header card, tabs, KPI row, content cards.

## 5. Components

| Component | Rules |
|---|---|
| Button | primary (filled primary), default (white with border), ghost (text only), danger (filled red), danger outline (red text). One primary button per view. Icon left, 14px |
| Input | Label above (12px / 600). Optional leading icon. Placeholder in ink-3. Error: red border and message below |
| Select | Input with chevron on the right |
| Segmented control | Mutually exclusive views or periods. Active segment primary-soft |
| Filter chip | Label with chevron, opens a dropdown |
| Tabs | Underline style, active tab primary with 2px underline |
| Badge | Soft background, dark text of the same hue. Optional leading dot for live status |
| Table | Header on surface-2. Right-align numbers. Row hover surface-2. Row menu as three dots |
| KPI card | Label, mono value, one-line context |
| Progress bar | 8px, rounded, primary. Amber below expectation, gray when not started |
| Timeline bar | 22px segmented bar: active primary, idle amber, break blue, offline gray |
| Avatar | Initials on soft colour, 28px, 56px on profiles |
| Banner | Soft colour, icon left, one sentence. Blue info, amber warning, red problem |
| Modal | Title bar with close, body, footer with actions right-aligned, primary last |
| Toggle and checkbox | Primary when on |
| Icons | Lucide, 15 to 16px, stroke 1.75 to 1.9 |

## 6. States every screen must implement

| State | Treatment |
|---|---|
| Loading | Skeleton rows or cards in gray-soft, no spinners for whole pages |
| Empty | Centered icon, one sentence, one action button |
| Error | Red banner at top of the card with a Retry button |
| No permission | Hide the control. Server still enforces |
| Offline (desktop) | Amber badge in the top bar, amber banner on dashboard, write actions in CRM and email disabled with tooltip. Shift controls stay enabled |
| Tracking on | Green dot and badge always visible in top bar and sidebar |

## 7. Implementation notes for AI models

1. Stack: React + Tailwind + shadcn/ui. Map the tokens above to Tailwind theme colours and CSS variables. Do not use the default shadcn palette.
2. The `html/` files are the visual reference. Reproduce spacing and hierarchy from them, then replace static content with data from the API (07-api-spec.md).
3. Build the shared components first (packages/ui): Button, Input, Select, Badge, Table, Card, KpiCard, ProgressBar, TimelineBar, Tabs, Segmented, Modal, Drawer, Banner, Avatar, AppShell (desktop), AdminShell.
4. Fonts: IBM Plex Sans and IBM Plex Mono. Bundle them in the desktop app (no network dependency).
5. All example names, numbers and domains in the images are sample data.
