// The Quest Board: ready-made Main Quests to accept and make your own. Each is
// written as an outline (the same format as "Paste an outline"), so it reads like a
// plan and goes through the same parser as quests you write yourself.
import { type MainQuestData, parseOutline } from './main-quests';
import type { Grade, Stat } from './rules';

export type BoardCategory = 'Learning' | 'Fitness' | 'Mind' | 'Life';
export const BOARD_CATEGORIES: BoardCategory[] = ['Learning', 'Fitness', 'Mind', 'Life'];

/** A daily quest that feeds the Main Quest, offered when accepting it. */
export interface TemplateHabit {
  name: string;
  stat: Stat;
  target: number;
  unit: string;
  grade: Grade;
  /** "daily" or weekdays, e.g. "1,3,5" (0 = Sunday). */
  schedule: string;
  minTarget: number | null;
}

export interface QuestTemplate {
  id: string;
  name: string;
  category: BoardCategory;
  stat: Stat;
  summary: string;
  /** Rough length at the suggested pace. */
  duration: string;
  title: string;
  habit: TemplateHabit | null;
  outline: string;
}

export const QUEST_BOARD: QuestTemplate[] = [
  {
    id: 'genai-engineer',
    name: 'GenAI Engineer',
    category: 'Learning',
    stat: 'INT',
    summary: 'From how LLMs work to MCP, RAG, agents, context engineering and building your own harness, with a real project closing every chapter.',
    duration: '12–16 weeks',
    title: 'Machine Mind Engineer',
    habit: { name: 'Study GenAI', stat: 'INT', target: 30, unit: 'min', grade: 'C', schedule: 'daily', minTarget: 10 },
    outline: `Foundations
  How LLMs work: tokens, context window, sampling
  Prompting: roles, examples, structured output
  Practice: Call an LLM API from code, with streaming and JSON output
  Embeddings and vector similarity
  Learn: Tool use and function calling [C]
  Boss: Build a CLI assistant that calls one real tool [B]
MCP & Tools
  MCP concepts: tools, resources, prompts
  Practice: Connect an existing MCP server to a client
  Learn: Auth and permissions for tools [C]
  Build: Write an MCP server for your own notes or files
  Boss: Ship an MCP server you use every week [B]
RAG
  Chunking strategies [C]
  Vector databases and hybrid search (keywords + vectors) [C]
  Practice: Index your own documents
  Learn: Reranking and query rewriting [C]
  Practice: Write a 20-question eval set with expected answers
  Boss: RAG over your docs with citations, measured on your eval set [A]
Agents
  The agent loop: plan, act, observe [C]
  Learn: Workflows vs agents, and when to use which [C]
  Practice: Multi-step tool use with error recovery
  Learn: Memory: short-term, long-term, summaries [C]
  Boss: An agent that finishes a real task end to end [A]
Context Engineering
  Context windows, prompt caching and cost [C]
  Learn: Compaction and summarisation [C]
  Practice: Just-in-time retrieval vs preloading context [B]
  Learn: Sub-agents and context isolation [B]
  Boss: Cut an agent's token use in half without losing quality [A]
Agentic Engineering & Harnesses
  Evals for agents: tasks, graders, regressions [B]
  Practice: Sandboxing and permissions for tool use [B]
  Learn: Observability: traces and logs [B]
  Read 3 engineering write-ups on agent harnesses x3 [C]
  Boss: Build a mini harness with evals that runs on every change [S]`,
  },
  {
    id: 'half-marathon',
    name: 'Couch to Half Marathon',
    category: 'Fitness',
    stat: 'AGI',
    summary: 'Walk-run to 5K, 10K and a half marathon, three runs a week. Easy pace most days; build slowly and back off if something hurts.',
    duration: '20–24 weeks',
    title: 'Long Road Runner',
    habit: { name: 'Run', stat: 'AGI', target: 30, unit: 'min', grade: 'D', schedule: '1,3,6', minTarget: 10 },
    outline: `Base
  Easy pace and the talk test [E]
  Learn: Shoes, warm-up and cool-down [E]
  Practice: Walk-run sessions x12 [D]
  Practice: Run 10 minutes without stopping
  Boss: Run 20 minutes without stopping [B]
5K
  Practice: Runs this phase x12 [C]
  Learn: Mobility and rest days [D]
  Practice: A long run of 4 km
  Boss: Run 5 km without stopping [B]
10K
  Practice: Runs this phase x12 [C]
  Learn: Fuelling and hydration basics
  Practice: Build your weekly long run to 8 km [B]
  Boss: Run 10 km [A]
Half Marathon
  Practice: Runs this phase x16 [B]
  Practice: A long run of 15 km [B]
  Practice: An 8 km run at race pace [B]
  Learn: Plan your taper week
  Boss: Run a half marathon (21.1 km) [S]`,
  },
  {
    id: 'strength-foundations',
    name: 'Strength Foundations',
    category: 'Fitness',
    stat: 'STR',
    summary: 'Learn the five movement patterns, build a three-a-week habit, then get measurably stronger with progressive overload.',
    duration: '12 weeks',
    title: 'Iron Will',
    habit: { name: 'Strength training', stat: 'STR', target: 30, unit: 'min', grade: 'C', schedule: '1,3,5', minTarget: 10 },
    outline: `Movement Basics
  The five patterns: squat, hinge, push, pull, carry [E]
  Practice: Bodyweight squat form, 3 sets of 10 [D]
  Practice: Push-up progression, incline to floor [D]
  Practice: Hinge drill: glute bridges and hip hinges [D]
  Boss: 20 squats, 10 push-ups and a 30-second plank in one go [C]
The Habit
  Practice: Training sessions x12 [C]
  Learn: Progressive overload: add reps, then load
  Learn: Sleep and protein basics
  Boss: 12 sessions in 4 weeks [B]
Getting Stronger
  Practice: Goblet squat, dumbbell row, overhead press [C]
  Practice: Log your lifts every session for 4 weeks [C]
  Learn: Deload weeks and recovery
  Boss: Add 20% to your first logged numbers [A]`,
  },
  {
    id: 'language-a2',
    name: 'Learn a Language (A1→A2)',
    category: 'Learning',
    stat: 'INT',
    summary: 'Any language: sounds and survival phrases, A1 grammar, real conversations, then A2. Speak early, a little every day.',
    duration: '6–9 months',
    title: 'Polyglot Initiate',
    habit: { name: 'Language practice', stat: 'INT', target: 20, unit: 'min', grade: 'C', schedule: 'daily', minTarget: 5 },
    outline: `Sounds & Survival
  Alphabet and pronunciation
  Learn your first 100 words [C]
  Practice: Introduce yourself in 5 sentences
  Boss: Record a 2-minute self-introduction [B]
A1
  Present tense and basic questions [C]
  Learn: Reach 300 words [C]
  Practice: Short diary entries in the language x10
  Boss: Pass an A1 practice test [B]
Real Conversations
  Practice: Short podcasts or videos x10
  Learn: Past tense [C]
  Practice: Conversations with a tutor or partner x5 [B]
  Boss: A 10-minute conversation about your week [A]
A2
  Learn: Reach 800 words [B]
  Practice: Read a graded reader cover to cover [B]
  Practice: Write a one-page story [B]
  Boss: Pass an A2 practice test [A]`,
  },
  {
    id: 'read-12-books',
    name: 'Read 12 Books',
    category: 'Learning',
    stat: 'INT',
    summary: 'A book a month for a year, one season at a time, with a short write-up to make each one stick.',
    duration: '12 months',
    title: 'Bookbound',
    habit: { name: 'Read', stat: 'INT', target: 20, unit: 'pages', grade: 'E', schedule: 'daily', minTarget: 5 },
    outline: `First Season
  Pick your 12 books (mix of fiction and non-fiction) [E]
  Practice: Finish books x3 [B]
  Boss: A one-page summary of your favourite so far [C]
Second Season
  Practice: Finish books x3 [B]
  Learn: Try a genre you never read [D]
  Boss: Tell someone about a book in 2 minutes [C]
Third Season
  Practice: Finish books x3 [B]
  Practice: Write down 3 ideas you now use x3 [C]
  Boss: A one-page summary of your favourite this season [C]
Final Season
  Practice: Finish books x3 [B]
  Learn: Re-read your notes from the year [D]
  Boss: Your top 3 of the year, and why [B]`,
  },
  {
    id: 'cook-20-dishes',
    name: 'Cook 20 Dishes',
    category: 'Life',
    stat: 'STA',
    summary: 'Knife skills and heat control, a core set of everyday dishes, then cooking for others. Twenty dishes you can make without a recipe.',
    duration: '10–12 weeks',
    title: 'Hearth Master',
    habit: { name: 'Cook at home', stat: 'STA', target: 1, unit: 'meal', grade: 'D', schedule: '1,3,5', minTarget: null },
    outline: `Kitchen Basics
  Knife skills: dice, slice, mince
  Practice: Stock a basic pantry
  Learn: Heat control: sauté, roast, simmer
  Boss: Cook a full meal for yourself [C]
Everyday Dishes
  Practice: Cook new dishes x9 [C]
  Practice: Rice and a grain, cooked perfectly
  Practice: A soup or dal from scratch
  Boss: Cook for someone else [B]
Cooking for Others
  Practice: Cook new dishes x10 [B]
  Learn: Balance flavour: salt, acid, fat, heat [C]
  Practice: Meal-prep a week of lunches [B]
  Boss: Host a dinner with three dishes [A]`,
  },
  {
    id: 'meditation-8-weeks',
    name: '8-Week Meditation',
    category: 'Mind',
    stat: 'SENSE',
    summary: 'An eight-week course in two-week stages: breath, attention, noticing, kindness. Short daily sits that grow longer.',
    duration: '8 weeks',
    title: 'Still Water',
    habit: { name: 'Meditate', stat: 'SENSE', target: 10, unit: 'min', grade: 'E', schedule: 'daily', minTarget: 2 },
    outline: `Weeks 1–2: Breath
  What mindfulness is, and what it isn't [E]
  Practice: Body scan x3
  Practice: Notice an urge without acting on it x3
  Boss: Meditate 10 days in a row [C]
Weeks 3–4: Attention
  Working with a wandering mind
  Practice: Mindful walks x3
  Practice: One mindful meal a day for a week x7 [C]
  Boss: A 20-minute sit [B]
Weeks 5–6: Noticing
  Noting thoughts and feelings [C]
  Practice: Three breaths before reacting x10 [C]
  Boss: A 30-minute sit [B]
Weeks 7–8: Kindness
  Practice: Loving-kindness practice x5 [C]
  Learn: Design your own routine for after the course [C]
  Boss: Four quiet hours: no phone, no screens [A]`,
  },
  {
    id: 'personal-finance',
    name: 'Personal Finance Basics',
    category: 'Life',
    stat: 'INT',
    summary: 'Know your numbers, build a safety net, handle debt, then plan long term. General education, not financial advice.',
    duration: '3–6 months',
    title: 'Treasurer',
    habit: { name: 'Track spending', stat: 'INT', target: 1, unit: '', grade: 'E', schedule: 'daily', minTarget: null },
    outline: `Know Your Numbers
  List your income and fixed costs
  Practice: Sort last month's spending into categories
  Learn: Needs, wants and savings
  Boss: A monthly budget you can actually keep [B]
Safety Net
  Emergency fund basics
  Practice: Automate a monthly transfer to savings
  Practice: Cancel subscriptions you don't use x2 [D]
  Boss: Save one month of expenses [A]
Debt & Credit
  How interest compounds on debt [C]
  Practice: List every debt with its interest rate
  Learn: Payoff methods: highest rate first vs smallest first [C]
  Boss: Pay off one debt, or make three extra payments [A]
Long Term
  Inflation, and why idle cash shrinks [C]
  Learn: What index funds and diversification are [C]
  Practice: Write your money goals for the next year
  Boss: Set up your first long-term savings plan [A]`,
  },
];

/** A fresh Main Quest from a template; `habitId` links the daily quest that feeds it. */
export function questFromTemplate(t: QuestTemplate, habitId: string | null): MainQuestData {
  return { v: 2, stat: t.stat, habitId, bounty: '', title: t.title, templateId: t.id, chapters: parseOutline(t.outline) };
}
