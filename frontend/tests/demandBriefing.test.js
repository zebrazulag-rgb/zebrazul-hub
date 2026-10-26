import test from 'node:test';
import assert from 'node:assert/strict';
import { demandTypeById, makeBriefingPayload, missingDemandFields, buildBriefingDescription } from '../src/utils/demandBriefing.js';

test('landing page routes to Site/LP', () => {
  const type = demandTypeById('landing_page');
  assert.equal(type.frontName, 'Site/LP');
  assert.equal(type.taskType, 'basic');
});

test('briefing blocks orphan demand', () => {
  const form = { demand_type: 'static_post', client_id: '', title: '', goal: '', due_date: '', assignee_ids: [], details: {} };
  const missing = missingDemandFields(form);
  assert.ok(missing.includes('cliente'));
  assert.ok(missing.includes('título'));
  assert.ok(missing.includes('o que precisa acontecer'));
  assert.ok(missing.includes('prazo'));
  assert.ok(missing.includes('responsável'));
});

test('briefing payload keeps structured direction and operational route', () => {
  const form = {
    demand_type: 'carousel', client_id: 7, title: 'Comparação apaga identidade',
    goal: 'Fazer o público perceber o custo de viver pela referência do outro.', due_date: '2026-11-10',
    priority: 'high', assignee_ids: [2], details: { audience: 'Empresários', main_message: 'Referência não é destino.' },
    references: 'link', notes: '', created_from: 'internal',
  };
  const payload = makeBriefingPayload(form);
  assert.equal(payload.front_name, 'Social Media');
  assert.equal(payload.content_type, 'carrossel');
  assert.equal(payload.goal, form.goal);
  assert.deepEqual(payload.assignee_ids, [2]);
  const parsed = JSON.parse(payload.briefing_json);
  assert.equal(parsed.demand_type, 'carousel');
  assert.equal(parsed.details.audience, 'Empresários');
});

test('description is readable outside the structured UI', () => {
  const text = buildBriefingDescription({
    demand_type: 'other', goal: 'Organizar a demanda',
    details: { format: 'Documento' }, references: '', notes: '',
  });
  assert.match(text, /OBJETIVO/);
  assert.match(text, /Organizar a demanda/);
  assert.match(text, /Documento/);
});
