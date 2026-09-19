# Context Lazy Loading: 5 Mechanisms

Effective context management is key to maximizing Claude's efficiency. These five mechanisms allow you to optimize loading, ranging from "eager" to "lazy."

| Mechanism | Type | Description |
| :--- | :--- | :--- |
| **1. EAGER** | `@import` / inline | Loads completely at startup. `@import` provides a single source of truth but does not save context usage. *(Ref: issue #11759)* |
| **2. CONDITIONAL** | Reference without `@` | Claude reads the file only upon an address match. Zero cost at startup, though loading is probabilistic. |
| **3. AUTO** | Subdirectory `CLAUDE.md` | Loads when the agent touches a file in the corresponding directory. *Note: There is some overhead/weight in the VS Code extension.* *(Ref: issue #24987)* |
| **4. LAZY** | Skills | Only a description is loaded at startup. The body and reference files are loaded based on relevance when a match is detected. Code executes without entering the context. |
| **5. TRUE EXPLICIT** | Slash-command | Loads only upon an explicit call or command. This is deterministic and provides full control over the loading process. |
