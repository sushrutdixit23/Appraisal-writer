# Sentinel as a project workspace

The model is Supabase's, applied to finance: a company is a **project**. You launch one in under a minute, it
opens on an overview that tells you what to do next, and from there everything is one click away in a side nav
that belongs to that project. Nothing about the data model changed; "project" is the word for a workspace.

## What carries over from Supabase, and why

| Supabase | Sentinel | Why it helps |
| --- | --- | --- |
| Projects home: cards, one big "New project" | `/sentinel/projects` | You see every company, its latest year, health and open findings before you open anything. |
| Project overview with a getting-started checklist | `/sentinel/projects/[id]` | A new project is never an empty page: it says what is missing (balance sheet, cash flow, a prior year) and what each step unlocks. |
| Project switcher in the top bar | Top bar | Change company without going back to a list; the choice follows you to every page. |
| Side nav that belongs to the project | Sidebar | Data, Analysis, Settings, in that order, for the company you are in. |
| Command menu (Ctrl/Cmd+K) | Command palette | Jump anywhere, switch project, change the display unit, start a new project, from the keyboard. |
| Import data from CSV | Import (PDF, CSV, Excel) | A multi-year sheet becomes several statements in one step, with a preview you confirm. |
| Table editor | Statements | The statements are the table; Add, Import, Edit are actions on it. |
| Project settings with a danger zone | Settings | Name, fiscal year, reporting unit, basis; delete is typed and last. |
| Row-level security | Unchanged | Your companies are yours; reference companies are read-only. |

Deliberately not copied: the SQL editor, logs, API keys, branching. They have no finance equivalent worth building.

## Navigation

```
Top bar        Projects / <project switcher> / <page>        [Ctrl+K]   Display: As reported | Crore | Lakh | Million
Sidebar        All projects   + New project
               <Project name>  sector, unit, basis
                 Overview
                 DATA      Statements   Add period   Import files   Edit periods
                 ANALYSIS  KPIs   Peers and trends   Investigations   Reviews
                 Settings
               PORTFOLIO   Executive dashboard
```

Reference companies get the read-only half: Overview, Statements, the Analysis pages and Settings (which says
why it is read-only). Add, Import and Edit are hidden because they would be refused anyway.

## Launching a project

1. **New project** asks for six things: name, sector, industry (optional), fiscal-year start, reporting unit,
   basis. One screen, one button.
2. It creates the project and lands on its **Overview**, which is deliberately not empty: it offers the two ways
   in (upload a file, type the figures) and shows the checklist.
3. The checklist ticks itself off as data arrives. Steps: first annual statement; balance sheet; cash flow; a
   prior year (unlocks growth and the YoY flags); first investigation; first approval.

An empty project is a normal state, as in Supabase. It is removable from Settings.

## Display unit

A CA thinks in lakh, a board in crore. The switch (and the palette commands) change how amounts are SHOWN on every
page and export. Nothing stored changes. "As reported" shows a company in its own unit and compares companies in
crore. A company's reporting unit (what its stored figures are in) is changed separately, in Settings, either
relabelled (the numbers were right, the label was wrong) or converted (the numbers are rescaled).

## Autofill (no AI by default)

PDF, CSV and Excel are read by rules. The PDF reader finds the statement pages, reads the column headers, drops
the note-number column, matches printed labels to fields and works out the few that are not printed (and labels
those "derived"). A sheet may be line items down with periods across, or one row per period. Every figure keeps
the line it was read from. An AI model is a separate, explicit button for filling blanks in a PDF, off by default.

## Import

`/sentinel/projects/[id]/import` takes several files at once. Each period a file holds becomes one row:
**New** (ticked), **Replaces** (what is on file for the same period and basis; not ticked until you tick it),
**Cannot import** (period not identified, or an accounting check failed; the reasons are listed) or
**Skipped** (the same period is in a richer file). Each saved period goes through the server's own
validation again; a failure on one row does not undo the others, and each row reports its own outcome.

## The command palette

Ctrl/Cmd+K. Type "lakh" (or "lac", "lacs", "crore", "mn") for the display unit; type "settings", "import" or a
project's name to go there. Where two commands match equally the display unit wins, so "lakh" is the unit and
"lakh ind" is the project. On a project's own page, switching project keeps you on the same sub-page.
