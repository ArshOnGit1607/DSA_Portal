import { Fragment, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useDsa } from '@dsa-portal/ui-core';

const GITHUB = 'https://github.com/dipu01-code/DSA_Portal';

const SNIPPETS = [
  [
    'function twoSum(nums, target) {',
    '  const seen = new Map();',
    '  for (let i = 0; i < nums.length; i++) {',
    '    const j = seen.get(target - nums[i]);',
    '    if (j !== undefined) return [j, i];',
    '    seen.set(nums[i], i);',
    '  }',
    '}',
  ],
  [
    'function search(nums, target) {',
    '  let lo = 0, hi = nums.length - 1;',
    '  while (lo <= hi) {',
    '    const mid = (lo + hi) >> 1;',
    '    if (nums[mid] === target) return mid;',
    '    if (nums[mid] < target) lo = mid + 1;',
    '    else hi = mid - 1;',
    '  }',
    '  return -1;',
    '}',
  ],
  [
    'function reverse(head) {',
    '  let prev = null;',
    '  while (head) {',
    '    const next = head.next;',
    '    head.next = prev;',
    '    prev = head;',
    '    head = next;',
    '  }',
    '  return prev;',
    '}',
  ],
];
const CHAR_MS = 45;
const LINE_PAUSE_MS = 250;
const KEYWORDS = /\b(function|const|let|for|of|while|if|else|return|new|undefined|null)\b/g;

/** Keywords in the accent colour, everything else plain: enough to read as code. */
function highlight(line: string) {
  return line.split(KEYWORDS).map((part, i) =>
    i % 2 ? (
      <span key={i} className="kw">
        {part}
      </span>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    )
  );
}

/**
 * Adds `in-view` while the element is on screen; CSS pauses its animations otherwise.
 * Without IntersectionObserver (old browsers, tests) everything just counts as visible.
 */
function useInView<T extends Element>(once = false) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => {
      setInView(e.isIntersecting);
      if (once && e.isIntersecting) io.disconnect();
    });
    io.observe(el);
    return () => io.disconnect();
  }, [once]);
  return [ref, inView] as const;
}

/**
 * Each line is uncovered left to right by a cover that shrinks in character steps (transform only),
 * then the tick fades in, then the snippet fades out; its animationend switches to the next snippet,
 * so pausing the CSS (off screen, reduced motion) also pauses the cycle.
 */
function EditorMock() {
  const [n, setN] = useState(0);
  const lines = SNIPPETS[n];
  let t = 400;
  const timed = lines.map((line) => {
    const ms = Math.max(line.length, 1) * CHAR_MS;
    const style = {
      '--chars': Math.max(line.length, 1),
      '--dur': `${ms}ms`,
      '--delay': `${t}ms`,
    } as CSSProperties;
    t += ms + LINE_PAUSE_MS;
    return { line, style };
  });
  const tickAt = t + 600;
  const fadeAt = tickAt + 3000;
  return (
    <div className="editor-mock" aria-hidden="true">
      <div className="editor-mock-bar">
        <span className="dot" />
        <span className="dot" />
        <span className="dot" />
        <span className="editor-mock-file">solution.js</span>
      </div>
      <div
        key={n}
        className="editor-mock-body"
        style={{ '--fade-delay': `${fadeAt}ms` } as CSSProperties}
        onAnimationEnd={(e) => {
          // Child animations (typing, tick) bubble up here too; only the fade-out ends a snippet.
          if (e.target === e.currentTarget) setN((i) => (i + 1) % SNIPPETS.length);
        }}
      >
        <pre>
          {timed.map(({ line, style }, i) => (
            <span key={i} className="type-line" style={style}>
              {highlight(line)}
            </span>
          ))}
        </pre>
        <p
          className="editor-mock-result"
          style={{ '--tick-delay': `${tickAt}ms` } as CSSProperties}
        >
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <path d="M4 12l5 5L20 6" />
          </svg>
          5/5 passed
        </p>
      </div>
    </div>
  );
}

// A 15-node binary tree; nodes are numbered in pre-order, the order they light up.
const TREE: { x: number; y: number; parent?: number }[] = [];
(function build(depth: number, x: number, span: number, parent?: number) {
  const id = TREE.length;
  TREE.push({ x, y: 40 + depth * 90, parent });
  if (depth === 3) return;
  build(depth + 1, x - span / 2, span / 2, id);
  build(depth + 1, x + span / 2, span / 2, id);
})(0, 400, 400);
const STEP_S = 0.7;

function TreeBackdrop() {
  return (
    <svg
      className="tree-bg"
      viewBox="0 0 800 340"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      {TREE.map((n, i) =>
        n.parent === undefined ? null : (
          <line key={`e${i}`} x1={TREE[n.parent].x} y1={TREE[n.parent].y} x2={n.x} y2={n.y} />
        )
      )}
      {TREE.map((n, i) => (
        <g key={i} transform={`translate(${n.x} ${n.y})`}>
          <circle r="9" className="node" />
          <circle r="9" className="node-lit" style={{ animationDelay: `${i * STEP_S}s` }} />
        </g>
      ))}
    </svg>
  );
}

// Bar heights (out of 7) in the scrambled order they start in; each slot settles to the sorted value.
const BARS = [5, 2, 7, 4, 1, 6, 3];
const SORTED = [...BARS].sort((a, b) => a - b);

function SortingBars() {
  return (
    <div className="bars" aria-hidden="true">
      {BARS.map((h, i) => (
        <span key={i} style={{ '--from': h, '--to': SORTED[i] } as CSSProperties} />
      ))}
    </div>
  );
}

const FEATURES: { title: string; text: string; icon: ReactNode }[] = [
  {
    title: 'Problems with real tests',
    text: 'Pick a topic and difficulty, get a random problem, and run your JavaScript against its test cases.',
    icon: <path d="M8 6l-6 6 6 6 M16 6l6 6-6 6" />,
  },
  {
    title: 'Hints, one step at a time',
    text: 'Stuck? Reveal hints one by one. The full solution unlocks once you have solved it.',
    icon: <path d="M9 18h6 M10 21h4 M12 3a6 6 0 0 0-4 10.5V16h8v-2.5A6 6 0 0 0 12 3z" />,
  },
  {
    title: 'Stats and leaderboard',
    text: 'Solved count, accuracy, streaks and progress by topic, plus a leaderboard to keep you going.',
    icon: <path d="M4 20V10 M10 20V4 M16 20v-7 M22 20H2" />,
  },
  {
    title: 'Works offline',
    text: 'Problems you have opened stay readable, and submissions queue on your device and sync when you are back.',
    icon: (
      <path d="M2 9a16 16 0 0 1 20 0 M5 13a11 11 0 0 1 14 0 M8.5 16.5a6 6 0 0 1 7 0 M12 20h.01" />
    ),
  },
];

const STEPS = ['Pick a problem', 'Write code', 'Run tests', 'Track progress'];

/** Public topic list (GET /topics needs no login); the section stays hidden if it fails. */
function useTopics() {
  const { api } = useDsa();
  const [topics, setTopics] = useState<string[] | null>(null);
  useEffect(() => {
    api.topics().then(setTopics, () => setTopics(null));
  }, [api]);
  return topics;
}

/** What logged-out visitors see at the root. */
export function LandingPage() {
  const [heroRef, heroInView] = useInView<HTMLElement>();
  const [featRef, featInView] = useInView<HTMLElement>(true);
  const [howRef, howInView] = useInView<HTMLElement>();
  const topics = useTopics();
  return (
    <div className="landing">
      <section
        ref={heroRef}
        className={`hero${heroInView ? '' : ' paused'}`}
        aria-labelledby="hero-title"
      >
        <TreeBackdrop />
        <div className="hero-text">
          <h1 id="hero-title">Practise DSA calmly, one problem at a time.</h1>
          <p className="lede">
            Pick a topic, write JavaScript in the browser, and run it against real tests.
          </p>
          <div className="row">
            <Link to="/register" className="cta primary">
              Get started
            </Link>
            <Link to="/login" className="cta">
              Log in
            </Link>
          </div>
        </div>
        <EditorMock />
      </section>

      <section
        ref={featRef}
        className={`features${featInView ? ' in' : ''}`}
        aria-labelledby="features-title"
      >
        <h2 id="features-title">Everything you need to practise</h2>
        <ul>
          {FEATURES.map((f, i) => (
            <li key={f.title} className="feature" style={{ transitionDelay: `${i * 120}ms` }}>
              <svg
                className="feature-icon"
                viewBox="0 0 24 24"
                width="24"
                height="24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                focusable="false"
              >
                {f.icon}
              </svg>
              <h3>{f.title}</h3>
              <p className="muted">{f.text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section
        ref={howRef}
        className={`how${howInView ? '' : ' paused'}`}
        aria-labelledby="how-title"
      >
        <h2 id="how-title">How it works</h2>
        <div className="how-body">
          <ol>
            {STEPS.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          <SortingBars />
        </div>
      </section>

      {topics && topics.length > 0 && (
        <section className="numbers" aria-labelledby="numbers-title">
          <h2 id="numbers-title">
            <span className="big">{topics.length}</span> topics to practise
          </h2>
          <ul className="topic-list">
            {topics.map((t) => (
              <li key={t} className="badge">
                {t}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="final-cta" aria-labelledby="cta-title">
        <h2 id="cta-title">Ready for your first problem?</h2>
        <div className="row">
          <Link to="/register" className="cta primary">
            Get started
          </Link>
          <Link to="/login" className="cta">
            Log in
          </Link>
        </div>
      </section>

      <footer className="landing-footer">
        <span className="muted">DSA Practice</span>
        <a href={GITHUB} target="_blank" rel="noreferrer">
          Source on GitHub
        </a>
      </footer>
    </div>
  );
}
