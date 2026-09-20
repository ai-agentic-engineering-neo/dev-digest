# System Maintenance and Governance

To prevent the `LEARNINGS.md` system from decaying into "documentation rot," follow these maintenance protocols:

## 1. Regular Cleaning
Periodically update the library. Old notes regarding resolved quirks eventually become "noise" or heavy technical debt. Remove or archive outdated information.

## 2. Conflict Resolution
Monitor for contradictions (e.g., one section states *"Always do X"* while another says *"X fails here"*). 
- **Action:** Review and resolve contradictions explicitly so the agent does not choose a path at random.

## 3. Preventing Bloat
If a file exceeds **200 entries**, the signal-to-noise ratio drops significantly.
- **Action:** Split the file into domain-specific files (e.g., `LEARNINGS-Auth.md`, `LEARNINGS-Database.md`).

## 4. Review Process
The `LEARNINGS` entry is a **draft for review**.
- While the "wrap-up" process automates 90% of the work, LLMs can summarize incorrectly. 
- **Action:** Human spot-checks are mandatory.

## 5. Version Control
Always manage these files via **Git**.
- **Benefits:** Provides a history of knowledge evolution, allows for reverting bad automated summaries, and enables team-wide sharing of lessons learned.
