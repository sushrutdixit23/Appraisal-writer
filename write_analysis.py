# save as fix_deep_analysis_dropdown.py, run: py fix_deep_analysis_dropdown.py
import pathlib

path = pathlib.Path("app/sentinel/analysis/page.tsx")
text = path.read_text(encoding="utf-8")

anchor1 = '''  const subjectWorkspace = workspaces.find((w) => w.id === subjectId)!;
  const sectorWorkspaces = workspaces.filter((w) => w.sector === subjectWorkspace.sector);
  const peerRows = buildPeerTable(sectorWorkspaces, statements, subjectId, "FY");'''
count1 = text.count(anchor1)
assert count1 == 1, f"Expected 1 match for anchor1, found {count1} — aborting, file may have changed"

insert1 = '''  const subjectWorkspace = workspaces.find((w) => w.id === subjectId)!;
  const sectorWorkspaces = workspaces.filter((w) => w.sector === subjectWorkspace.sector);
  // "Viewing as" should let you pick ANY company, not just ones sharing
  // the currently-selected company's sector - sectorWorkspaces stays
  // scoped (used for the actual peer comparison below), this is only
  // for the selector itself. Previously the dropdown was built from
  // sectorWorkspaces directly, which meant a company in a sector with
  // no other members yet (e.g. a lone FMCG company) could never be
  // selected once the default subject happened to load from a
  // different sector - there was no way back to it from the dropdown.
  const allWorkspacesSorted = [...workspaces].sort((a, b) =>
    a.company_name.localeCompare(b.company_name)
  );
  const peerRows = buildPeerTable(sectorWorkspaces, statements, subjectId, "FY");'''

text = text.replace(anchor1, insert1)

anchor2 = '''        <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} style={selectStyle}>
          {sectorWorkspaces.map((w) => (
            <option key={w.id} value={w.id}>
              {w.company_name}
            </option>
          ))}
        </select>'''
count2 = text.count(anchor2)
assert count2 == 1, f"Expected 1 match for anchor2, found {count2} — aborting, file may have changed"

insert2 = '''        <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} style={selectStyle}>
          {allWorkspacesSorted.map((w) => (
            <option key={w.id} value={w.id}>
              {w.company_name}
            </option>
          ))}
        </select>'''

text = text.replace(anchor2, insert2)

path.write_text(text, encoding="utf-8")
print(f"OK — patched {path}, new size {len(text.encode('utf-8'))} bytes")