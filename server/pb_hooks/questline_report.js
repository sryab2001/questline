/// <reference path="../pb_data/types.d.ts" />

// Weekly report: summarises a player's last two weeks from their synced data and
// asks an OpenAI-compatible model (Groq by default) to write it in the System's voice.
// Only numbers and quest names are sent, never "what I learned" notes.
//
// Configured by environment variables (set in /opt/questline/questline.env):
//   GROQ_API_KEY   required
//   GROQ_MODEL     default llama-3.3-70b-versatile
//   AI_API_URL     default https://api.groq.com/openai/v1/chat/completions

const DEFAULT_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = 'llama-3.3-70b-versatile';
const MANUAL_COOLDOWN_MS = 5 * 60 * 1000;

function env(name, fallback) {
  const v = $os.getenv(name);
  return v ? v : fallback;
}

function list(collection, filter, sort, limit, params) {
  return $app.findRecordsByFilter(collection, filter, sort, limit, 0, params);
}

function parseJson(text, fallback) {
  try {
    return JSON.parse(text);
  } catch (_) {
    return fallback;
  }
}

/** The numbers the report is written from, or null without enough history. */
function summarize(userId) {
  const p = { o: userId };
  const results = list('day_results', 'owner = {:o} && deleted_at = 0', '-day', 14, p);
  const days = results
    .map((r) => {
      const goals = parseJson(r.getString('outcomes_json'), []);
      return { day: r.getString('day'), goals: goals, kept: goals.length > 0 && goals.every((g) => g.done || g.min) };
    })
    .filter((d) => d.goals.length > 0);
  if (days.length < 3) return null;

  const thisWeek = days.slice(0, 7);
  const prevWeek = days.slice(7, 14);
  const thisDays = {};
  const prevDays = {};
  thisWeek.forEach((d) => (thisDays[d.day] = true));
  prevWeek.forEach((d) => (prevDays[d.day] = true));

  const habits = list('habits', 'owner = {:o} && deleted_at = 0 && archived = false', 'sort_order', 50, p);
  const oldest = days[days.length - 1].day;
  const logs = list('logs', 'owner = {:o} && deleted_at = 0 && day >= {:d}', '', 10000, { o: userId, d: oldest });

  const quests = habits.map((h) => {
    const id = h.id;
    let kept = 0;
    let minimum = 0;
    let missed = 0;
    thisWeek.forEach((d) => {
      d.goals.forEach((g) => {
        if (g.habitId !== id) return;
        if (g.done) kept += 1;
        else if (g.min) minimum += 1;
        else missed += 1;
      });
    });
    let total = 0;
    let prevTotal = 0;
    logs.forEach((l) => {
      if (l.getString('habit_id') !== id) return;
      if (thisDays[l.getString('day')]) total += l.getFloat('amount');
      else if (prevDays[l.getString('day')]) prevTotal += l.getFloat('amount');
    });
    return {
      name: h.getString('name'),
      target: h.getFloat('target'),
      unit: h.getString('unit'),
      limitQuest: h.getString('limit_source') === 'screen_time',
      thisWeek: { fullClears: kept, minimumClears: minimum, missed: missed, totalLogged: Math.round(total * 10) / 10 },
      previousWeekTotalLogged: Math.round(prevTotal * 10) / 10,
    };
  });

  const mainQuests = list('class_quests', 'owner = {:o} && deleted_at = 0', 'created', 20, p).map((q) => {
    const data = parseJson(q.getString('steps_json'), []);
    const chapters = Array.isArray(data) ? [{ title: 'Chapter 1', tasks: data }] : data.chapters || [];
    let done = 0;
    let total = 0;
    let doneThisWeek = 0;
    let current = null;
    chapters.forEach((c) => {
      const tasks = c.tasks || [];
      total += tasks.length;
      tasks.forEach((t) => {
        if (t.doneDay) done += 1;
        if (t.doneDay && t.doneDay >= thisWeek[thisWeek.length - 1].day) doneThisWeek += 1;
      });
      if (!current && tasks.some((t) => !t.doneDay)) current = c.title;
    });
    return { name: q.getString('name'), questsDone: done, questsTotal: total, clearedThisWeek: doneThisWeek, currentChapter: current };
  });

  const reviews = list('events', "owner = {:o} && deleted_at = 0 && kind = 'review'", '-created', 1, p);
  const review = reviews.length ? parseJson(reviews[0].getString('data_json'), {}) : {};

  return {
    through: days[0].day,
    thisWeek: { daysWithQuests: thisWeek.length, daysKept: thisWeek.filter((d) => d.kept).length },
    previousWeek: { daysWithQuests: prevWeek.length, daysKept: prevWeek.filter((d) => d.kept).length },
    quests: quests,
    mainQuests: mainQuests,
    lastWeeksFocus: review.focus || null,
  };
}

const SYSTEM_PROMPT = [
  'You are "the System" from a Solo Leveling-style habit app called Questline. Write the player\'s weekly report.',
  'Voice: terse, formal, a little mechanical, encouraging without guilt. Address the player as "Player".',
  'Use only the numbers given. Limit Quests (limitQuest: true) are kept by staying UNDER the target; their totals are minutes used.',
  'Structure, under 170 words, plain text, these exact headings:',
  'VERDICT: one line.',
  'GAINS: one or two specific wins with numbers.',
  'WEAK POINT: the single biggest problem and a likely cause.',
  'ADJUSTMENTS: exactly two concrete changes for next week (e.g. lower a target, add a minimum, move the cue, plan the weak day).',
  'MAIN QUEST: one sentence on progress, if there are Main Quests.',
  'No medical, legal or financial advice. No emojis.',
].join('\n');

/** Preferred general chat models, best first; used when the configured one isn't available. */
const PREFERRED = [/gpt-oss-120b/, /llama-3\.3-70b/, /llama-4/, /qwen/, /gpt-oss/, /llama/, /mistral|gemma|kimi|deepseek/];
const NOT_CHAT = /whisper|tts|guard|playai|orpheus|embed|vision-only|distil/i;

/** Picks a chat model this key can use, from the provider's model list. */
function pickModel(key) {
  const res = $http.send({
    url: env('AI_API_URL', DEFAULT_URL).replace(/\/chat\/completions$/, '/models'),
    method: 'GET',
    timeout: 20,
    headers: { authorization: 'Bearer ' + key },
  });
  if (res.statusCode !== 200 || !res.json || !res.json.data) return null;
  const ids = res.json.data.filter((m) => m.active !== false && !NOT_CHAT.test(m.id)).map((m) => m.id);
  for (const re of PREFERRED) {
    const hit = ids.find((id) => re.test(id));
    if (hit) return hit;
  }
  return ids[0] || null;
}

function chat(key, model, summary) {
  return $http.send({
    url: env('AI_API_URL', DEFAULT_URL),
    method: 'POST',
    timeout: 60,
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
    body: JSON.stringify({
      model: model,
      temperature: 0.6,
      max_tokens: 900,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: 'Weekly data:' + String.fromCharCode(10) + JSON.stringify(summary) },
      ],
    }),
  });
}

const errorText = (res) => (res.json && res.json.error && res.json.error.message ? res.json.error.message : 'HTTP ' + res.statusCode);

function writeReport(summary) {
  const key = env('GROQ_API_KEY', '');
  if (!key) throw new BadRequestError('The AI report is not set up on this server yet (GROQ_API_KEY is missing).');
  let model = env('GROQ_MODEL', DEFAULT_MODEL);
  let res = chat(key, model, summary);
  // The configured model isn't offered to this key (providers retire and rename models):
  // pick one that is, so the report keeps working without a config change.
  if (res.statusCode === 404 || (res.statusCode === 400 && /model/i.test(errorText(res)))) {
    const fallback = pickModel(key);
    if (fallback && fallback !== model) {
      model = fallback;
      res = chat(key, model, summary);
    }
  }
  if (res.statusCode !== 200) throw new BadRequestError('The AI service refused the request: ' + errorText(res));
  const raw = String(res.json.choices[0].message.content || '');
  // Some models (e.g. Qwen) put their hidden reasoning in <think> tags before the answer.
  const text = raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  if (!text) throw new BadRequestError('The AI service returned an empty report. Try again, or set GROQ_MODEL to another model.');
  return { model: model, text: text };
}

function save(userId, through, report) {
  const record = new Record($app.findCollectionByNameOrId('reports'));
  record.set('owner', userId);
  record.set('through', through);
  record.set('body', report.text);
  record.set('model', report.model);
  $app.save(record);
  return { id: record.id, through: through, body: report.text, model: report.model, created: record.getString('created') };
}

/** Writes a report now for one player (the app's "Ask the System" button). */
function generateFor(userId) {
  const last = list('reports', 'owner = {:o}', '-created', 1, { o: userId });
  if (last.length) {
    const created = new Date(last[0].getString('created').replace(' ', 'T')).getTime();
    if (Date.now() - created < MANUAL_COOLDOWN_MS) throw new TooManyrequestsError('A report was just written. Try again in a few minutes.');
  }
  const summary = summarize(userId);
  if (!summary) throw new BadRequestError('Not enough history yet: close a few more days first.');
  return save(userId, summary.through, writeReport(summary));
}

/** Sunday job: a report for every player who opted in, once per week of data. */
function generateWeekly() {
  if (!env('GROQ_API_KEY', '')) return;
  const optedIn = list('settings', 'ai_report = true', '', 500, {});
  optedIn.forEach((s) => {
    const userId = s.getString('owner');
    try {
      const summary = summarize(userId);
      if (!summary) return;
      const done = list('reports', 'owner = {:o} && through = {:t}', '', 1, { o: userId, t: summary.through });
      if (done.length) return;
      save(userId, summary.through, writeReport(summary));
    } catch (e) {
      console.log('questline weekly report failed for ' + userId + ': ' + e);
    }
  });
}

module.exports = { summarize: summarize, generateFor: generateFor, generateWeekly: generateWeekly };
