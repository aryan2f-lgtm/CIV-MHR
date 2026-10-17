# Civinaar Urencalculator

Voorcalculatie van ingenieursuren per project: taken per fase, uren per medewerker,
vier scenario's (Scherp, Laag, Marktconform, Ruim) met overschrijdingskans, en Excel-export.

Geen build-stap nodig: open `index.html` in de browser, of start een lokale server:

```bash
npx serve .
# of
python -m http.server 8000
```

## Bestanden

| Bestand | Inhoud |
|---|---|
| `index.html` | Opbouw van de pagina |
| `src/styles.css` | Opmaak (licht en donker thema via CSS-variabelen in `:root`) |
| `src/kengetallen.js` | Alle normen: rollen + tarieven + marktband, fasen, eenheden, taken met normuren, scenario's, schalen, projecttypen, invoervelden |
| `src/app.js` | Rekenen (`derive`, `compute`), opslag, weergave, Excel-export |

## Waar pas je wat aan?

- **Tarieven en marktband**: `ROLES` in `kengetallen.js` — `[id, naam, tarief, min, max]`.
- **Taken en normuren**: `TASKS` — `[id, fase, naam, eenheid, {rol: uren per eenheid}, complexiteitsgevoelig (1/0), onzekerheid (0–1)]`.
  Normuren zijn voor een medior tekenaar en een project van gemiddelde complexiteit.
- **Eenheden** (A1-blad, 100 m riool, overleg, week …): `UNITS` — label + functie op de projectgegevens.
- **Tekenschaal → meters / m² per A1-blad**: `SCALES`.
- **Complexiteit en niveau tekenaar**: `CPLX` (0,65 / 1 / 1,65) en `LEVEL` (1,35 / 1 / 0,75), uit de Tekenuren-tabel.
- **Hergebruik tussen tekeningen**: `REUSE` (DO-situatie 70% als de VO-situatietekening aan staat, bestek 60% als de DO-tekening aan staat).
- **Projecttypen en standaard uitgezette taken**: `TYPES`, `TYPE_OFF`, `TYPE_PHASE_OFF`.
- **Invoervelden en standaardwaarden**: `PARAMS`.
- **Scenario's**: `SCEN` (labels); de factoren staan per project in `factors` (standaard 0,75 / 0,88 / 1,0 / 1,2).

## Rekenmodel

1. `derive()` berekent A1-bladen (wijk/groen: op oppervlak; straat/riool: ook op lengte, per half blad),
   profielbladen (6 profielen per blad), overleggen opdrachtgever (1 per 2 weken) en bouwvergaderingen.
2. `compute()` doet per taak: normuren × aantal × hergebruik × complexiteit × niveau tekenaar × (1 + correctie%).
   Kwaliteitscontrole (vier-ogen) is een percentage van de ontwerpuren (SO t/m bestek), verdeeld over de rollen van die taak.
   Daarna worden de uren afgerond op hele uren, zo dat taken, fasen en rollen op hetzelfde totaal uitkomen.
3. Overschrijdingskans: 3.000 simulaties, projectbrede factor (lognormaal, σ 15%) maal een
   factor per taak (σ = 0,6 × onzekerheid). De simulaties worden zo geschaald dat de mediaan gelijk is aan de
   marktconforme uren. Kans = aandeel simulaties boven het afgeronde scenariobudget.

## Opslag

Deze losse versie bewaart projecten in `localStorage` van de browser (sleutel `civinaar-uren-v1`).
Wil je projecten delen met collega's, vervang dan `lsLoad` / `lsSave` / `saveNow` in `app.js`
door een eigen backend (bijvoorbeeld Supabase of Firebase). Het projectobject is gewone JSON.

## Ideeën voor uitbreiding

- Normen bijstellen op basis van nacalculatie (werkelijk / begroot per taak, gemiddeld over projecten).
- Offertebrief (Word/PDF) genereren uit het gekozen scenario.
- Import van de Excel-export terug in de app.
- Inloggen en rechten per medewerker.
