# Active Tasks

Current work in progress and planned tasks.

## In Progress

| ID | Title | Priority | Link |
|----|-------|----------|------|
| - | - | - | - |

## Planned (Next)

| ID | Title | Priority | Link |
|----|-------|----------|------|
| US-004 | Implement Testing Infrastructure | Medium | [Details](./US-004-testing/) |

## Recently Completed

| ID | Title | Notes |
|----|-------|-------|
| US-003 | ContentPageModel Extraction | Closed - architecture review concluded existing design is correct |
| US-002 | Editor Registry Pattern | Declarative editor registration in `register-editors.ts` |
| US-001 | Fix Circular Dependencies | Direct imports instead of barrel exports |
| US-005 | Create User Documentation | Completed - see `/docs/` folder |

## How to Work on Tasks

### Starting a Task

1. Check this file for available tasks
2. Read the task's `README.md` in its folder
3. Update task status to "In Progress"
4. Update this file to move task to "In Progress" section

### During Work

1. Update the task's progress checklist as you complete items
2. Add notes for any decisions or discoveries
3. Commit regularly with task ID in message: `US-001: Fix import in ScriptContext`

### Completing a Task

1. Verify all acceptance criteria are met
2. Run the documentation checklist:
   - [ ] Update architecture docs (if structure changed)
   - [ ] Update standards docs (if new patterns established)
   - [ ] Update user docs in `/docs/` (if user-facing changes)
   - [ ] Update CLAUDE.md (if significant patterns or key files changed)
   - [ ] Update `/docs/whats-new.md` (for notable features/changes)
3. Update this file: move task to "Recently Completed" section
4. **Ask user for confirmation** before deleting the task folder
5. Delete task folder after user confirms

## Creating New Tasks

1. Copy `_template/` folder to `US-XXX-short-name/`
2. Fill in the README.md
3. Add to "Planned" section in this file
4. Use next available US number

## Task ID Format

`US-XXX` where XXX is a sequential number.

- US-001 through US-099: Infrastructure/refactoring
- US-100+: Features and enhancements

---

*Last updated: 2026-02*
