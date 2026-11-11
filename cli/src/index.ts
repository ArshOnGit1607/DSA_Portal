import * as readline from 'readline';
import * as path from 'path';
import {
  loadProblems,
  selectRandomProblem,
  submitCode,
  HintService,
  SolutionService,
  type Problem,
  type ExecutionResult,
  type Topic,
  type Difficulty,
} from '@dsa-portal/core';

const PROBLEMS_DIR = path.join(__dirname, '..', 'problems');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

let problems: Problem[] = [];
const recentIds: string[] = [];
const MAX_RECENT = 5;
const stats = { attempted: 0, solved: 0 };

const hintService = new HintService();
const solutionService = new SolutionService();

function load() {
  try {
    problems = loadProblems(PROBLEMS_DIR);
  } catch (err) {
    console.error('Failed to load problems:', err);
    process.exit(1);
  }
}

function prompt(question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

function listTopics(): string[] {
  return [...new Set(problems.map((p) => p.topic))];
}

function listDifficulties(): string[] {
  return [...new Set(problems.map((p) => p.difficulty))];
}

async function chooseProblem(): Promise<Problem | null> {
  console.log('\n--- Choose a problem ---');
  const topics = listTopics();
  topics.forEach((t, i) => console.log(`${i + 1}. ${t}`));
  const topicIdx = parseInt(await prompt('Select topic (number): '), 10) - 1;
  const topic = topics[topicIdx] as Topic;
  if (!topic) {
    console.log('Invalid topic.');
    return null;
  }

  const difficulties = listDifficulties();
  difficulties.forEach((d, i) => console.log(`${i + 1}. ${d}`));
  const diffIdx = parseInt(await prompt('Select difficulty (number): '), 10) - 1;
  const difficulty = difficulties[diffIdx] as Difficulty;
  if (!difficulty) {
    console.log('Invalid difficulty.');
    return null;
  }

  const problem = selectRandomProblem(problems, {
    topic,
    difficulty,
    recentIds,
  });

  if (!problem) {
    console.log('No problems match that topic/difficulty.');
    return null;
  }

  return problem;
}

function displayProblem(p: Problem) {
  console.log('\n========================================');
  console.log(`${p.title} — ${p.difficulty} — ${p.topic}`);
  console.log('========================================');
  console.log(p.description);
  console.log('\n--- Starter code ---');
  console.log(p.starterCode);
}

async function runSubmission(p: Problem) {
  console.log('\nPaste your JavaScript solution below.');
  console.log("Type 'END' on its own line when finished.");
  const lines: string[] = [];
  for (;;) {
    const line = await prompt('> ');
    if (line === 'END') break;
    lines.push(line);
  }
  const userCode = lines.join('\n');

  const result: ExecutionResult = submitCode({ problem: p, userCode });
  stats.attempted += 1;
  const passedCount = result.perTest.filter((r) => r.passed).length;
  if (result.status === 'passed') {
    stats.solved += 1;
    console.log(`\n✅ All ${passedCount}/${result.perTest.length} test cases passed!`);
  } else if (result.status === 'timeout') {
    console.log(`\n⏱️  Submission timed out (${passedCount}/${result.perTest.length} passed).`);
  } else if (result.status === 'error') {
    console.log(`\n💥 Submission errored (${passedCount}/${result.perTest.length} passed).`);
  } else {
    console.log(`\n❌ ${passedCount}/${result.perTest.length} test cases passed.`);
  }
  result.perTest.forEach((r: ExecutionResult['perTest'][number], i: number) => {
    const status = r.passed ? '✅' : '❌';
    console.log(`${status} Test ${i + 1}: ${r.passed ? 'passed' : 'failed'}`);
    if (!r.passed) {
      console.log(`   expected: ${JSON.stringify(r.expected)}`);
      console.log(`   actual:   ${JSON.stringify(r.actual)}`);
      if (r.error) console.log(`   error: ${r.error}`);
    }
  });

  recentIds.unshift(p.id);
  if (recentIds.length > MAX_RECENT) recentIds.pop();
}

async function showHints(p: Problem) {
  console.log('\n--- Hints ---');
  for (let level = 1; ; level++) {
    const hint = hintService.getHint(p, level);
    if (!hint) break;
    console.log(`Level ${level}: ${hint.content}`);
  }
}

async function showSolution(p: Problem) {
  const sol = solutionService.getSolution(p);
  console.log('\n--- Reference Solution ---');
  console.log(sol.code);
  if (sol.explanation) console.log(`\n${sol.explanation}`);
}

async function main() {
  load();
  console.log('Welcome to DSA Practice CLI');

  for (;;) {
    console.log(`\nStats: ${stats.solved}/${stats.attempted} solved`);
    console.log('1. Choose & solve a problem');
    console.log('2. Exit');
    const choice = await prompt('Select an option: ');

    if (choice === '1') {
      const p = await chooseProblem();
      if (p) {
        displayProblem(p);
        const action = await prompt('\n(s)ubmit code, (h)ints, (l) solution, (b)ack: ');
        if (action === 's') await runSubmission(p);
        else if (action === 'h') await showHints(p);
        else if (action === 'l') await showSolution(p);
        else if (action === 'b') {
          // back to main menu
        }
      }
    } else if (choice === '2') {
      console.log('Goodbye!');
      break;
    }
  }

  rl.close();
}

main().catch((err) => {
  console.error(err);
  rl.close();
  process.exit(1);
});
