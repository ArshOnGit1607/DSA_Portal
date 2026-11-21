# DSA Practice CLI

Practise data structures and algorithms in your terminal.

```
npm install -g dsa-practice-cli
dsa
```

- 41 problems across 8 topics (Arrays, Strings, Linked List, Trees, Graphs, Dynamic Programming, Sorting, Searching), each Easy, Medium or Hard.
- Pick a topic and difficulty and get a random problem (recent ones are skipped), or search for a specific one.
- Full-screen terminal UI: a home screen with your progress per topic, and a problem screen that keeps the statement, hints or test results above the action menu.
- Keys: ↑/↓ (or j/k) to move, Enter to select, a number to jump, q or Esc to go back, d/u to scroll long text.
- Press `/` on the home screen to search every problem by title, topic or difficulty and open it directly.
- Write a `solve(input)` function in JavaScript. "Write solution in editor" opens `$VISUAL` / `$EDITOR` (default `vi`, `notepad` on Windows) on a draft pre-filled with the starter code; save and quit to submit. Drafts are kept in `~/.dsa-practice/drafts/`, so a retry reopens your last attempt. "Paste solution" still works: paste, then type `END` on its own line.
- Solutions run locally in a sandboxed child process against the problem's test cases, with time, memory and output limits.
- You stay on a problem until you go back, so you can take a hint (one level at a time) and try again.
- A reference solution with an explanation.
- Your attempted and solved problems are saved in `~/.dsa-practice/stats.json`.

Requires Node.js 20 or newer.

Colour is off when `NO_COLOR` is set. With piped input (no terminal) the menus become numbered prompts, so the CLI can be scripted.
