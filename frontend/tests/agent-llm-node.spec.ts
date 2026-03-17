import { test, expect } from '@playwright/test';

/**
 * E2E: Create agent in Puppy Agents, drag LLM skill to canvas, configure node with agent, delete agent.
 * Prerequisites: Backend (uvicorn) and MongoDB running.
 */

const LLM_SKILL_NAME = 'E2E LLM Skill';
const AGENT_NAME = `E2E Agent ${Date.now()}`;

test('create agent, add LLM node, configure agent, delete agent', async ({ page, request }) => {
  test.setTimeout(60000);

  // 1. Create LLM skill via API (needed for drag)
  const skillData = {
    name: LLM_SKILL_NAME,
    type: 'llm',
    description: 'LLM skill for E2E agent test',
    implementation: { prompt_template: 'Summarize: {{text}}' }
  };
  const skillRes = await request.post('/api/skills', { data: skillData });
  test.skip(skillRes.status() !== 200, 'Backend not running - start uvicorn in backend/ before E2E');
  const createdSkill = await skillRes.json();
  const skillId = createdSkill._id || createdSkill.id;

  page.on('dialog', (dialog) => dialog.accept());
  await page.goto('/');

  // 2. Open Puppy Agents, create new agent with dummy API key
  await page.getByRole('button', { name: 'Puppy Agents' }).click();
  await expect(page.getByText('Puppy Agents')).toBeVisible();
  await page.getByRole('button', { name: 'New Agent' }).click();
  await page.getByTestId('agent-name-input').fill(AGENT_NAME);
  await page.getByTestId('agent-api-key-input').fill('dummy-api-key');
  await page.getByTestId('agent-save-btn').click();
  await expect(page.locator('button').filter({ hasText: AGENT_NAME }).first()).toBeVisible({ timeout: 5000 });
  await page.getByTestId('agent-modal-close').click();

  // 3. Add Start Node (re-get canvas after modal close)
  const startNodeCard = page.locator('div[draggable]').filter({ hasText: 'Start Node' }).first();
  const canvas = page.locator('.react-flow').first();
  await startNodeCard.waitFor({ state: 'visible' });
  const cardBox = await startNodeCard.boundingBox();
  const canvasBox = await canvas.boundingBox();
  if (!cardBox || !canvasBox) throw new Error('Could not get bounding boxes');
  await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(canvasBox.x + 150, canvasBox.y + 150, { steps: 10 });
  await page.mouse.up();
  await expect(page.locator('.react-flow__node').filter({ hasText: 'Start' })).toBeVisible({ timeout: 5000 });

  // 4. Add LLM Skill Node
  const skillCard = page.locator('div[draggable]').filter({ hasText: LLM_SKILL_NAME }).first();
  await skillCard.waitFor({ state: 'visible' });
  await skillCard.scrollIntoViewIfNeeded();
  const skillCardBox = await skillCard.boundingBox();
  if (!skillCardBox || !canvasBox) throw new Error('Could not get skill card box');
  await page.mouse.move(skillCardBox.x + skillCardBox.width / 2, skillCardBox.y + skillCardBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(canvasBox.x + 450, canvasBox.y + 150, { steps: 10 });
  await page.mouse.up();
  await expect(page.locator('.react-flow__node').filter({ hasText: LLM_SKILL_NAME })).toBeVisible({ timeout: 10000 });

  // 5. Connect Start -> LLM
  const startNode = page.locator('.react-flow__node').filter({ hasText: 'Start' }).first();
  const llmNode = page.locator('.react-flow__node').filter({ hasText: LLM_SKILL_NAME }).first();
  const startHandle = startNode.locator('[data-testid="start-handle"], [class*="react-flow__handle"]').first();
  const llmHandle = llmNode.locator('[data-testid="puppy-handle-target"], [class*="react-flow__handle"]').first();
  await startHandle.dragTo(llmHandle);

  // 6. Configure LLM node: select our agent (get value from option with agent name)
  await llmNode.hover();
  await llmNode.getByRole('button', { name: 'Node Settings' }).click();
  const agentOption = page.locator('select option').filter({ hasText: AGENT_NAME }).first();
  const agentId = await agentOption.getAttribute('value');
  await page.locator('select').filter({ has: page.locator(`option[value="${agentId}"]`) }).selectOption({ value: agentId });
  await page.getByTestId('node-config-save').click();

  // 7. Delete agent: open Puppy Agents, select, Delete, Confirm
  await page.getByRole('button', { name: 'Puppy Agents' }).click();
  await page.locator('button').filter({ hasText: AGENT_NAME }).first().click();
  await page.getByTestId('agent-delete-btn').click();
  await page.getByTestId('agent-delete-confirm').click();
  await expect(page.locator('button').filter({ hasText: AGENT_NAME })).toHaveCount(0);

  // 8. Cleanup: delete LLM skill via API
  await request.delete(`/api/skills/${skillId}`);
});
