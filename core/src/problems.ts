import { Difficulty, Problem, TestCase, Topic } from './types';

export const PROBLEMS: Problem[] = [
  {
    id: 'two-sum',
    title: 'Two Sum',
    topic: 'Arrays',
    difficulty: 'Easy',
    description:
      'Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target. You may assume that each input would have exactly one solution.',
    starterCode: 'function solve(input) {\n  const { nums, target } = input;\n  // your code here\n  return [];\n}\n',
    testCases: [
      { input: { nums: [2, 7, 11, 15], target: 9 }, expected: [0, 1] },
      { input: { nums: [3, 2, 4], target: 6 }, expected: [1, 2] },
      { input: { nums: [3, 3], target: 6 }, expected: [0, 1] },
    ] as TestCase[],
    hints: [
      'Use a hash map to store value -> index as you iterate.',
      'For each number, check whether (target - num) already exists in the map.',
    ],
    solution:
      'function solve(input) { const { nums, target } = input; const map = new Map(); for (let i = 0; i < nums.length; i++) { const complement = target - nums[i]; if (map.has(complement)) return [map.get(complement), i]; map.set(nums[i], i); } return []; }',
  },
  {
    id: 'palindrome-number',
    title: 'Palindrome Number',
    topic: 'Strings',
    difficulty: 'Easy',
    description:
      'Given an integer x, return true if x is a palindrome integer, and false otherwise. A palindrome integer reads the same backward as forward.',
    starterCode: 'function solve(input) {\n  const { x } = input;\n  // your code here\n  return false;\n}\n',
    testCases: [
      { input: { x: 121 }, expected: true },
      { input: { x: -121 }, expected: false },
      { input: { x: 10 }, expected: false },
    ] as TestCase[],
    hints: ['Negative numbers cannot be palindromes.', 'Reverse the digits and compare with the original.'],
    solution:
      'function solve(input) { const { x } = input; if (x < 0) return false; let rev = 0, n = x; while (n > 0) { rev = rev * 10 + (n % 10); n = Math.floor(n / 10); } return rev === x; }',
  },
  {
    id: 'merge-two-sorted-lists',
    title: 'Merge Two Sorted Lists',
    topic: 'LinkedList',
    difficulty: 'Easy',
    description:
      'Given the heads of two sorted linked lists list1 and list2, merge the two lists into one sorted list and return its head.',
    starterCode: 'function solve(input) {\n  const { list1, list2 } = input;\n  // your code here\n  return null;\n}\n',
    testCases: [
      { input: { list1: [1, 2, 4], list2: [1, 3, 4] }, expected: [1, 1, 2, 3, 4, 4] },
      { input: { list1: [], list2: [] }, expected: [] },
      { input: { list1: [], list2: [0] }, expected: [0] },
    ] as TestCase[],
    hints: ['Use a dummy head node and a tail pointer.', 'Repeatedly attach the smaller of the two current nodes.'],
    solution:
      'function solve(input) { const { list1, list2 } = input; const dummy = { next: null }; let tail = dummy; let a = list1, b = list2; while (a && b) { if (a[0] <= b[0]) { tail.next = a; a = a.next; } else { tail.next = b; b = b.next; } tail = tail.next; } tail.next = a || b; return dummy.next; }',
  },
];

export function getProblem(id: string): Problem | undefined {
  return PROBLEMS.find((p) => p.id === id);
}

export function getRandomProblem(): Problem {
  return PROBLEMS[Math.floor(Math.random() * PROBLEMS.length)];
}

export function listProblems() {
  return PROBLEMS.map(({ id, title, topic, difficulty }) => ({ id, title, topic, difficulty }));
}
