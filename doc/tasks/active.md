# Active Tasks

Current work in progress and planned tasks.

## In Progress

| ID | Title | Priority | Link |
|----|-------|----------|------|
| US-001 | Fix Circular Dependencies | Medium | [Details](./US-001-circular-deps/) |

## Planned (Next)

| ID | Title | Priority | Link |
|----|-------|----------|------|
| US-002 | Editor Registry Pattern | High | [Details](./US-002-editor-registry/) |
| US-003 | ContentPageModel Extraction | Medium | [Details](./US-003-content-page-model/) |
| US-004 | Implement Testing Infrastructure | Medium | [Details](./US-004-testing/) |

## Recently Completed

| ID | Title | Notes |
|----|-------|-------|
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
2. Run the completion checklist:
   - [ ] Update architecture docs (if structure changed)
   - [ ] Update standards docs (if new patterns)
   - [ ] Update user docs (if user-facing)
   - [ ] Update CLAUDE.md (if significant)
   - [ ] Add to changelog/what's new
3. Move task to completed (or delete folder)
4. Remove from this file

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
