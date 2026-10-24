/// <reference path="../pb_data/types.d.ts" />

// Weekly AI report: an endpoint the app calls ("Ask the System") and a Sunday job
// for players who opted in. The logic lives in questline_report.js; handlers run in
// isolated contexts, so each one loads it with require().

routerAdd(
  'POST',
  '/api/questline/report',
  (e) => {
    const report = require(`${__hooks}/questline_report.js`);
    return e.json(200, report.generateFor(e.auth.id));
  },
  $apis.requireAuth('users'),
);

// Sundays 13:30 UTC (19:00 in India). Override with QUESTLINE_REPORT_CRON.
cronAdd('questline_weekly_report', $os.getenv('QUESTLINE_REPORT_CRON') || '30 13 * * 0', () => {
  const report = require(`${__hooks}/questline_report.js`);
  report.generateWeekly();
});
