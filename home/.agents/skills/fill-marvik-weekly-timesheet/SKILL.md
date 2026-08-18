---
name: fill-marvik-weekly-timesheet
description: Fill Santiago's weekly Aleph timesheet from real git/PR/Linear history. Use when the user asks to fill, update or catch up the timesheet / planilla de horas / hours for a week or date range.
---

# Timesheet

Reconstruct real work from the repo and render it as timesheet rows. Verify against PRs/Linear — never invent tasks.

## Format (7 columns)

`Date | Name | Project | Category | Task description | Dedicated time | Weekly total`

- **Date** = the **Monday** of the week (every row in a week shares it).
- **Name** = `Santiago Dalmasso`
- **Project** = `Aleph-Financial Platform` (or `Day Off`)
- **Category** (a.k.a. Task type), one of: `Internal meetings/tasks`, `Code development`, `Bugfixing`, `PR/Code review`, `Research`, `Testing`, `Documentation`
- **Task description** = paraphrased work, ordered frontend → api → tests. **No issue IDs or PR numbers.**
- **Dedicated time** = integer **1–7** h per row.
- **Weekly total** = `40` for full weeks; for a partial week up to a cutoff use **8h × elapsed weekdays** (e.g. Mon+Tue = 16).

### Per-week rules
- Each week **starts** with `Internal meetings/tasks` → `Sprint planning and standups with Aleph`.
- Each week **ends** with `PR/Code review` → `Reviewing and addressing pull request feedback`.
- Rows in a week must **sum to the Weekly total**.
- **Day off**: add rows with Project `Day Off`, Category `Public holiday`, blank description, hours summing **8** (split `6` + `2`). These count toward the 40. Confirm holidays with the user.

## Process

1. **Scope the weeks.** Find the last filled week in the user's existing sheet; fill from there up to the cutoff (default: yesterday). Weeks are Monday-anchored. Ask the user about any day-off days.
2. **Gather real work** (run in parallel):
   ```bash
   ME="$(git config user.name)"   # author filter; --author is a case-sensitive regex, so match the real configured name
   git log --since=<start> --until=<end> --author="$ME" --pretty=format:"%ad | %s" --date=short
   gh pr list --author "@me" --state merged --limit 60 --json number,title,mergedAt,createdAt \
     --jq '.[] | select(.mergedAt >= "<start>") | "\(.mergedAt[0:10]) | #\(.number) \(.title)"' | sort
   gh pr list --author "@me" --state open --limit 30 --json number,title,createdAt --jq '.[] | "\(.createdAt[0:10]) | #\(.number) \(.title)"'
   # current/partial week, incl. unmerged branches:
   git log --all --since=<mon> --until=<cutoff+1> --author="$ME" --pretty=format:"%ad | %s" --date=short
   ```
   PR titles carry the Linear IDs (`ACT-`, `URG-`, `CHAT-`). Use `mergedAt`/`createdAt` to place work in the right week. If Linear MCP is authenticated it can corroborate, but GitHub is authoritative and sufficient.
3. **Map PRs → rows.** One PR ≈ one row. Group an epic across days/weeks ("Starting…", "Continuing…", "Finalizing…", "Merging…"). Balance hours to hit the weekly total; don't repeat the same PR in two weeks.
4. **Write the markdown table** of only the missing rows. Add brief notes (which week was completed, day-off split, partial-week total).

## Copy 3 columns to Google Sheets

When asked, emit `Category` (tab) `Task description` (tab) `Dedicated time`, one row per line, **in the same order as the table** (include day-off rows for alignment), and copy:
```bash
pbcopy < /tmp/timesheet_cols.tsv   # then: "Copiado. Filas: $(wc -l < /tmp/timesheet_cols.tsv)"
```
Note to user: day-off rows come out as `Public holiday`; they must set Project `Day Off` by hand (that column isn't in the 3-col copy). Paste with `Cmd+V` on the first Task-type cell.
