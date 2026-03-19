import { test, expect } from '@playwright/test';

/**
 * E2E: Workflow with approval node - run 3 times, click Approve / Reject / Edit,
 * verify node and workflow status are correct.
 * Prerequisites: Backend (uvicorn) and MongoDB running.
 */

const SKILL_NAME = 'E2E Approval Test Skill';

const runAndWaitPaused = async (page: any) => {
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  const runNowBtn = page.getByRole('button', { name: 'Run Now' });
  if (await runNowBtn.isVisible()) {
    await page.getByPlaceholder(/Enter manual_input_text/).fill('e2e approval input');
    await runNowBtn.click();
  }
  await expect(page.locator('.react-flow__node').filter({ hasText: SKILL_NAME }).first().getByText('PAUSED')).toBeVisible({ timeout: 20000 });
};

test('approval node: approve, reject, edit - verify status', async ({ page, request }) => {
  test.setTimeout(120000);

  const skillData = {
    name: SKILL_NAME,
    type: 'tool',
    description: 'Skill for approval E2E test',
    implementation: {
      executor: 'python_eval',
      config: {
        code: `def execute(inputs):
  return {'result': 'ok', 'echo': inputs.get('manual_input_text', '')}`
      }
    }
  };

  const skillRes = await request.post('/api/skills', { data: skillData });
  test.skip(skillRes.status() !== 200, 'Backend not running - start uvicorn in backend/ before E2E');
  const createdSkill = await skillRes.json();
  const skillId = createdSkill._id || createdSkill.id;

  page.on('dialog', (dialog) => dialog.accept());
  await page.goto('/');

  try {
  // 1. Create new workflow
  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('button', { name: 'Create New Flow' }).click();

  // 2. Add Start Node
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

  // 3. Add Skill Node (require_approval defaults to true on add)
  const skillCard = page.locator('div[draggable]').filter({ hasText: SKILL_NAME }).first();
  await skillCard.waitFor({ state: 'visible' });
  const skillCardBox = await skillCard.boundingBox();
  if (!skillCardBox || !canvasBox) throw new Error('Could not get skill card box');
  await page.mouse.move(skillCardBox.x + skillCardBox.width / 2, skillCardBox.y + skillCardBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(canvasBox.x + 450, canvasBox.y + 150, { steps: 10 });
  await page.mouse.up();
  await expect(page.locator('.react-flow__node').filter({ hasText: SKILL_NAME })).toBeVisible({ timeout: 5000 });

  // 4. Connect Start -> Skill
  const startNode = page.locator('.react-flow__node').filter({ hasText: 'Start' }).first();
  const skillNode = page.locator('.react-flow__node').filter({ hasText: SKILL_NAME }).first();
  const startHandle = startNode.locator('[data-testid="start-handle"], [class*="react-flow__handle"]').first();
  const skillHandle = skillNode.locator('[data-testid="puppy-handle-target"], [class*="react-flow__handle"]').first();
  await startHandle.dragTo(skillHandle);

  // 5. Configure Start node: set default input text
  await startNode.getByRole('button', { name: 'Start Node Settings' }).click();
  await page.getByPlaceholder('Enter the initial prompt or data here...').fill('hello approval');
  await page.getByTestId('node-config-save').click();

  // 6. Skill node has require_approval=true by default when added from sidebar

  const approvalNode = () => page.locator('.react-flow__node').filter({ hasText: SKILL_NAME }).first();

  // --- Run 1: Approve ---
  await runAndWaitPaused(page);
  await approvalNode().getByRole('button', { name: 'Approve' }).click();
  await expect(approvalNode().getByText('COMPLETED')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('text=completed').first()).toBeVisible();

  // --- Run 2: Reject ---
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  const runNow2 = page.getByRole('button', { name: 'Run Now' });
  if (await runNow2.isVisible()) {
    await page.getByPlaceholder(/Enter manual_input_text/).fill('e2e reject input');
    await runNow2.click();
  }
  await expect(approvalNode().getByText('PAUSED')).toBeVisible({ timeout: 20000 });
  await approvalNode().getByRole('button', { name: 'Reject' }).click();
  await expect(approvalNode().getByText('ERROR')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('text=error').first()).toBeVisible();

  // --- Run 3: Edit ---
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  const runNow3 = page.getByRole('button', { name: 'Run Now' });
  if (await runNow3.isVisible()) {
    await page.getByPlaceholder(/Enter manual_input_text/).fill('e2e edit input');
    await runNow3.click();
  }
  await expect(approvalNode().getByText('PAUSED')).toBeVisible({ timeout: 20000 });
  await approvalNode().getByRole('button', { name: 'Edit' }).click();
  await approvalNode().locator('textarea').fill('{"result":"edited","echo":"e2e edit input"}');
  await approvalNode().getByRole('button', { name: 'Save & Resume' }).click();
  await expect(approvalNode().getByText('COMPLETED')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('text=completed').first()).toBeVisible();
  await expect(approvalNode().getByText('Outputs')).toBeVisible();
  await expect(approvalNode().locator('pre').filter({ hasText: 'edited' })).toBeVisible({ timeout: 5000 });
  } finally {
    // Cleanup: delete workflow first (references skill), then skill
    const wfRes = await request.get('/api/workflows');
    if (wfRes.ok) {
      const workflows = await wfRes.json();
      for (const wf of workflows) {
        const hasOurSkill = wf.nodes?.some((n: { skill_id?: string }) => n.skill_id === skillId);
        if (hasOurSkill) {
          await request.delete(`/api/workflows/${wf._id}`);
        }
      }
    }
    await request.delete(`/api/skills/${skillId}`);
  }
});
