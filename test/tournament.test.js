import assert from 'node:assert/strict';
import test from 'node:test';
import { freshSave, restart, fractureRisk, fittingPrice, rareOdds } from '../forge.js';
import {
  createEntry, settleRound, courseFor, tournamentState, masteryOf, gate, dayKey, abandonEntry,
} from '../tournament.js';
import { workshopStatus } from '../workshop.js';

const blade = (id, stats = [72, 65, 91, 70, 63, 59]) => ({ id, name: '成刀 ' + id, grade: '上品', stats });
const rosterSave = () => Object.assign(freshSave(18), { count: 3, collection: [blade(1), blade(2), blade(3)] });
const quick = { score: 620, combo: 3, cut: 5, waves: 2, damage: 5, hits: 6, durability: 72, remaining: 0, reason: 'time' };
const clear = run => {
  const course = courseFor(run);
  const cut = course.waves.reduce((total, wave) => total + wave.targets.length, 0);
  return { ...quick, cut, damage: cut, hits: cut, waves: course.waves.length, reason: 'clear', remaining: 34, durability: 80 };
};
const school = grade => ({ mode: 'school', school: 'edge', grade });

test('borrowing a practice blade creates no checkpoint or growth', () => {
  const save = freshSave(18);
  assert.equal(createEntry(save, { mode: 'quick' }, [], 'quick').error, '完成第一把成刀即可报名');
  const { run } = createEntry(save, { mode: 'practice', material: 'gel' }, [], 'practice');
  assert.equal(run.roster[0].id, 'training');
  assert.equal(courseFor(run).limit, 12);
  assert.deepEqual(courseFor(run).waves[0].targets, ['gel']);
  assert.equal(tournamentState(save).active, null);
  assert.ok(settleRound(save, 'practice', 0, quick).error);
  assert.equal(workshopStatus(save).xp, 0);
});

test('school clearance is sequential and settles one time per round', () => {
  const save = rosterSave();
  const initialStats = [...save.collection[0].stats];
  assert.ok(gate(save, school(1)));
  const { run } = createEntry(save, school(0), ['1'], 'first');
  const first = settleRound(save, 'first', 0, clear(run)).record;
  assert.equal(first.report.win, true);
  assert.equal(first.mastery.level, '新铸');
  assert.equal(save.tournament.schools.edge, 1);
  const credited = structuredClone(save);
  assert.ok(settleRound(save, 'first', 0, clear(run)).error);
  assert.deepEqual(save, credited);
  const again = createEntry(save, school(0), ['1'], 'again').run;
  const repeat = settleRound(save, 'again', 0, clear(again)).record;
  assert.equal(first.xp - repeat.xp, 50);
  assert.equal(repeat.mastery.bonus, .02);
  assert.deepEqual(save.collection[0].stats, initialStats);
  assert.ok(gate(save, { mode: 'national' }));
  const second = createEntry(save, school(1), ['1'], 'second').run;
  settleRound(save, 'second', 0, clear(second));
  assert.equal(gate(save, { mode: 'national' }), '');
});

test('national checkpoints survive reload and credit a blade at most once per edition', () => {
  let save = rosterSave();
  save.tournament = { schools: { edge: 2 } };
  createEntry(save, { mode: 'national' }, ['1'], 'national');
  for (let round = 0; round < 5; round++) {
    save = JSON.parse(JSON.stringify(save));
    const { active } = tournamentState(save);
    assert.equal(active.roster[0].id, '1');
    assert.equal(active.reports.length, round);
    const { record } = settleRound(save, active.id, round, clear(active));
    assert.equal(record.champion, round === 4);
    assert.ok(settleRound(save, active.id, round, clear(active)).error);
  }
  assert.equal(save.tournament.titles.national, 1);
  assert.equal(masteryOf(save, save.collection[0]).matches, 1);
  assert.equal(gate(save, { mode: 'apex' }), '');
});

test('apex locks a unique roster, uses separate blades and requires three complete courses', () => {
  const save = rosterSave();
  save.tournament = { titles: { national: 1 } };
  assert.ok(createEntry(save, { mode: 'apex' }, ['1', '1', '2'], 'bad').error);
  createEntry(save, { mode: 'apex' }, ['2', '3', '1'], 'apex');
  for (let round = 0; round < 3; round++) {
    const { active } = tournamentState(save);
    const result = settleRound(save, active.id, round, clear(active)).record;
    assert.equal(result.blade, '成刀 ' + [2, 3, 1][round]);
    assert.equal(result.champion, round === 2);
  }
  assert.equal(save.tournament.titles.apex, 1);
  assert.deepEqual(Object.values(save.tournament.mastery).map(item => item.matches), [1, 1, 1]);
});

test('daily credits only the first qualified attempt, timed and using distinct targets', () => {
  const save = rosterSave();
  const date = dayKey(Date.UTC(2026, 10, 8, 16));
  assert.equal(date, '2026-11-09');
  const start = id => createEntry(save, { mode: 'daily' }, ['1'], id, date).run;
  const weak = start('weak');
  assert.equal(settleRound(save, weak.id, 0, { ...quick, hits: 3 }).record.cr, 0);
  const first = start('valid');
  assert.equal(courseFor(first).seed, date);
  assert.ok(settleRound(save, first.id, 0, quick).record.cr > 0);
  const second = start('repeat');
  const receipt = settleRound(save, second.id, 0, { ...quick, score: 900 }).record;
  assert.equal(receipt.cr, 0);
  assert.equal(receipt.xp, 0);
  assert.equal(save.tournament.daily[date].best, 900);
  assert.equal(masteryOf(save, save.collection[0]).matches, 1);
  const pending = start('abandon');
  assert.equal(abandonEntry(save, pending.id), true);
  assert.ok(settleRound(save, pending.id, 0, quick).error);
});

test('workshop level counts older appraisals and freezes perks when a new furnace starts', () => {
  const save = rosterSave();
  save.run.phase = 'appraise';
  save.tournament = { xp: 850 };
  assert.equal(workshopStatus(save).level, 5);
  assert.equal(fittingPrice(save.run), 12);
  assert.equal(restart(save, 19), true);
  assert.equal(fittingPrice(save.run), 10);
  assert.equal(rareOdds(save.run, 0), 7);
  save.run.hits = 29;
  assert.equal(fractureRisk(save.run), .48);
  save.tournament.xp += 1000;
  assert.equal(fractureRisk(save.run), .48);
});
