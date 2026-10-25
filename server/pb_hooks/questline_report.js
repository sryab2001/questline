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

// Prompts tuned in the pilot (docs/behavior-design.md): the app computes every finding;
// the model only ranks and explains them, in the System's voice.
const RULES = [
  'Rules:',
  '- "findings" are computed facts, ranked most important first, each tagged with its kind in brackets. Use only patterns that appear in the findings; never call a habit an anchor unless an [anchor habit] finding says so.',
  '- Use only the numbers given; never compute new ones. "change" already states whether this period is up or down; repeat it, do not reinterpret it.',
  '- Targets and limits are PER DAY. Limit Quests are kept by staying UNDER their daily limit.',
  '- After each claim, cite its number in brackets, e.g. "Run anchors Study GenAI [96% vs 0%]".',
  '- Every order reads exactly "If <specific situation>, then <one small action>." Prefer shrinking a target, moving a cue, a fixed time slot or a Minimum Clear over "try harder".',
  '- If playerWriting is given, use it to explain causes; never quote it at length.',
  '- No emojis. No medical, legal or financial advice. Plain text.',
];

const PROMPTS = {
  week: [
    'You are "the System" from Questline, a Solo Leveling-style habit app. Voice: terse, formal, slightly mechanical; never shaming. Address the player as "Player".',
  ]
    .concat(RULES)
    .concat([
      'Write under 150 words with these headings, each on its own line:',
      'STATUS: one line with this period, its change, and the streak.',
      'KEEP: the top positive finding ([anchor habit], [mood link], [time of day], [streak], [recovery]) and why it matters.',
      'THREAT: the top negative finding ([screen time], [weak weekday], [target too high], [strength trend] falling) and its likely cause.',
      'ORDERS: exactly two orders aimed at the threat.',
      'MAIN QUEST: one sentence per quest in mainQuests (pace and finish estimate); omit the heading if mainQuests is empty.',
    ])
    .join('\n'),
  month: [
    'You are "the System" from Questline, a Solo Leveling-style habit app, writing the end-of-Season analysis. Voice: formal, precise, a little ceremonial; never shaming. Address the player as "Player".',
  ]
    .concat(RULES)
    .concat([
      'Write under 260 words with these headings, each on its own line:',
      'SEASON VERDICT: two lines: this period with its change, the streak and Gates.',
      'WHAT DRIVES YOU: two or three positive findings, with numbers.',
      'WHAT BREAKS YOU: the two top negative findings, with numbers.',
      'NEXT SEASON ORDERS: exactly three orders, each tied to one finding above.',
      'MAIN QUEST: pace and finish estimate per quest in mainQuests; omit the heading if mainQuests is empty.',
    ])
    .join('\n'),
  // When the app hasn't sent its analysis yet: the older, simpler weekly summary.
  legacy: [
    'You are "the System" from a Solo Leveling-style habit app called Questline. Write the player\'s weekly report.',
    'Voice: terse, formal, a little mechanical, encouraging without guilt. Address the player as "Player".',
    'Use only the numbers given. Limit Quests (limitQuest: true) are kept by staying UNDER the target; their totals are minutes used.',
    'Under 170 words, plain text, these headings: VERDICT (one line), GAINS (one or two wins with numbers), WEAK POINT (biggest problem, likely cause), ADJUSTMENTS (exactly two concrete changes), MAIN QUEST (one sentence, if any).',
    'No medical, legal or financial advice. No emojis.',
  ].join('\n'),
};

const MAX_INPUT_CHARS = 30000;

/** The player's own writing goes to the AI only if their settings allow it. */
function allowsWriting(userId) {
  try {
    return !!$app.findRecordById('settings', 'settings-' + userId).get('ai_reads_writing');
  } catch (_) {
    return false;
  }
}

/** Validates the analysis the app sent; returns a clean copy, or null if unusable. */
function cleanInput(userId, input, period) {
  if (!input || typeof input !== 'object' || input.period !== period || !input.to) return null;
  const copy = JSON.parse(JSON.stringify(input));
  if (!allowsWriting(userId)) delete copy.playerWriting;
  if (JSON.stringify(copy).length > MAX_INPUT_CHARS) {
    delete copy.playerWriting;
    if (JSON.stringify(copy).length > MAX_INPUT_CHARS) return null;
  }
  return copy;
}

/** The latest analysis the app saved for a period (synced as an event), if any. */
function savedInput(userId, period) {
  const rows = list('events', "owner = {:o} && deleted_at = 0 && kind = 'report_input' && ref = {:r}", '-created', 1, { o: userId, r: period });
  return rows.length ? cleanInput(userId, parseJson(rows[0].getString('data_json'), null), period) : null;
}

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

/** Keep reasoning models brief, so the token budget goes to the report itself. */
function reasoningParams(model) {
  if (/gpt-oss/.test(model)) return { reasoning_effort: 'low' };
  if (/qwen/.test(model)) return { reasoning_format: 'hidden' };
  return {};
}

function chat(key, model, prompt, data) {
  return $http.send({
    url: env('AI_API_URL', DEFAULT_URL),
    method: 'POST',
    timeout: 60,
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
    body: JSON.stringify(
      Object.assign(
        {
          model: model,
          temperature: 0.6,
          // Reasoning models spend tokens thinking before they answer; leave room for both.
          max_tokens: 2000,
          messages: [
            { role: 'system', content: prompt },
            { role: 'user', content: 'Data:' + String.fromCharCode(10) + JSON.stringify(data) },
          ],
        },
        reasoningParams(model),
      ),
    ),
  });
}

const errorText = (res) => (res.json && res.json.error && res.json.error.message ? res.json.error.message : 'HTTP ' + res.statusCode);

function writeReport(data, promptName) {
  const prompt = PROMPTS[promptName];
  const key = env('GROQ_API_KEY', '');
  if (!key) throw new BadRequestError('The AI report is not set up on this server yet (GROQ_API_KEY is missing).');
  let model = env('GROQ_MODEL', DEFAULT_MODEL);
  let res = chat(key, model, prompt, data);
  // The configured model isn't offered to this key (providers retire and rename models):
  // pick one that is, so the report keeps working without a config change.
  if (res.statusCode === 404 || (res.statusCode === 400 && /model/i.test(errorText(res)))) {
    const fallback = pickModel(key);
    if (fallback && fallback !== model) {
      model = fallback;
      res = chat(key, model, prompt, data);
    }
  }
  if (res.statusCode !== 200) throw new BadRequestError('The AI service refused the request: ' + errorText(res));
  const raw = String(res.json.choices[0].message.content || '');
  // Some models (e.g. Qwen) put their hidden reasoning in <think> tags before the answer.
  const text = raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  if (!text) throw new BadRequestError('The AI service returned an empty report. Try again, or set GROQ_MODEL to another model.');
  return { model: model, text: text };
}

function save(userId, period, through, report) {
  const record = new Record($app.findCollectionByNameOrId('reports'));
  record.set('owner', userId);
  record.set('period', period);
  record.set('through', through);
  record.set('body', report.text);
  record.set('model', report.model);
  $app.save(record);
  return { id: record.id, period: period, through: through, body: report.text, model: report.model, created: record.getString('created') };
}

/**
 * Writes a report now for one player (the app's "Ask the System" button). The app
 * sends its computed analysis; without one, the server summarises raw data (weekly).
 */
function generateFor(userId, body) {
  const period = body && body.period === 'month' ? 'month' : 'week';
  const last = list('reports', 'owner = {:o}', '-created', 1, { o: userId });
  if (last.length) {
    const created = new Date(last[0].getString('created').replace(' ', 'T')).getTime();
    if (Date.now() - created < MANUAL_COOLDOWN_MS) throw new TooManyrequestsError('A report was just written. Try again in a few minutes.');
  }
  const input = cleanInput(userId, body && body.input, period);
  if (input) return save(userId, period, input.to, writeReport(input, period));
  if (period === 'month') throw new BadRequestError('Open the Season analysis in the app first, so it can send the numbers.');
  const summary = summarize(userId);
  if (!summary) throw new BadRequestError('Not enough history yet: close a few more days first.');
  return save(userId, 'week', summary.through, writeReport(summary, 'legacy'));
}

/** Scheduled job: a report for every player who opted in, once per period of data. */
function generateScheduled(period) {
  if (!env('GROQ_API_KEY', '')) return;
  const optedIn = list('settings', 'ai_report = true', '', 500, {});
  optedIn.forEach((st) => {
    const userId = st.getString('owner');
    try {
      const input = savedInput(userId, period);
      const data = input || (period === 'week' ? summarize(userId) : null);
      if (!data) return;
      const through = input ? input.to : data.through;
      const done = list('reports', 'owner = {:o} && through = {:t} && period = {:p}', '', 1, { o: userId, t: through, p: period });
      if (done.length) return;
      save(userId, period, through, writeReport(data, input ? period : 'legacy'));
    } catch (e) {
      console.log('questline ' + period + ' report failed for ' + userId + ': ' + e);
    }
  });
}

module.exports = {
  summarize: summarize,
  generateFor: generateFor,
  generateWeekly: function () {
    generateScheduled('week');
  },
  generateMonthly: function () {
    generateScheduled('month');
  },
};
