import { test, expect } from '@playwright/test';

/**
 * E2E: Create new workflow, configure node params, execute, verify result, delete skill (cleanup).
 * Prerequisites: Backend (uvicorn) and MongoDB running.
 * Run from project root: cd backend && uvicorn app.main:app --reload
 */

test('create workflow, configure nodes, execute, verify result, delete skill', async ({ page, request }) => {
  test.setTimeout(60000);
  const SKILL_NAME = 'E2E Test Skill';

  const skillData = {
    name: SKILL_NAME,
    type: 'tool',
    description: 'Simple skill for E2E test',
    implementation: {
      executor: 'python_eval',
      config: {
        code: `def execute(inputs):
  return {'result': 'ok', 'echo': inputs.get('manual_input_text', '')}`
      }
    }
  };

  const res = await request.post('/api/skills', { data: skillData });
  test.skip(res.status() !== 200, 'Backend not running - start uvicorn in backend/ before E2E');

  page.on('dialog', (dialog) => dialog.accept());
  await page.goto('/');

  // 1. Create new workflow
  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('button', { name: 'Create New Flow' }).click();

  // 2. Add Start Node: drag from sidebar to canvas (use mouse API for HTML5 DnD)
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

  // Wait for Start node to appear
  await expect(page.locator('.react-flow__node').filter({ hasText: 'Start' })).toBeVisible({ timeout: 5000 });

  // 3. Add Skill Node
  const skillCard = page.locator('div[draggable]').filter({ hasText: SKILL_NAME }).first();
  await skillCard.waitFor({ state: 'visible' });
  const skillCardBox = await skillCard.boundingBox();
  if (!skillCardBox || !canvasBox) throw new Error('Could not get skill card box');
  await page.mouse.move(skillCardBox.x + skillCardBox.width / 2, skillCardBox.y + skillCardBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(canvasBox.x + 450, canvasBox.y + 150, { steps: 10 });
  await page.mouse.up();

  await expect(page.locator('.react-flow__node').filter({ hasText: SKILL_NAME })).toBeVisible({ timeout: 5000 });

  // 4. Connect Start -> Skill: drag from Start's handle to Skill's handle
  const startNode = page.locator('.react-flow__node').filter({ hasText: 'Start' }).first();
  const skillNode = page.locator('.react-flow__node').filter({ hasText: SKILL_NAME }).first();

  const startHandle = startNode.locator('[data-testid="start-handle"], [class*="react-flow__handle"]').first();
  const skillHandle = skillNode.locator('[data-testid="puppy-handle-target"], [class*="react-flow__handle"]').first();

  await startHandle.dragTo(skillHandle);

  // 5. Configure Start node: set default input text
  await startNode.getByRole('button', { name: 'Start Node Settings' }).click();
  await page.getByPlaceholder('Enter the initial prompt or data here...').fill('hello from e2e');
  await page.getByTestId('node-config-save').click();

  // 6. Configure Skill node: disable require approval (click label, checkbox is sr-only)
  await skillNode.hover();
  await skillNode.getByRole('button', { name: 'Node Settings' }).click();
  await page.getByText('Require Approval').locator('xpath=..').locator('xpath=..').locator('label').click();
  await page.getByTestId('node-config-save').click();

  // 7. Execute
  await page.getByRole('button', { name: 'Run' }).click();

  // If RunConfigModal opens (no manual_input_text), fill and run
  const runNowBtn = page.getByRole('button', { name: 'Run Now' });
  if (await runNowBtn.isVisible()) {
    await page.getByPlaceholder(/Enter manual_input_text/).fill('e2e input');
    await runNowBtn.click();
  }

  // 8. Wait for skill node to show COMPLETED (scoped to node we configured)
  const completedNode = page.locator('.react-flow__node').filter({ hasText: SKILL_NAME }).first();
  await expect(completedNode.getByText('COMPLETED')).toBeVisible({ timeout: 20000 });

  // 9. Verify: status shows completed
  await expect(page.locator('text=completed').first()).toBeVisible();

  // 10. Verify: skill node shows completed (redundant but explicit)
  await expect(completedNode.locator('text=COMPLETED')).toBeVisible();

  // 11. Verify: node has actual output (Outputs block with expected data)
  await expect(completedNode.getByText('Outputs')).toBeVisible();
  const outputPre = completedNode.locator('pre').filter({ hasText: 'result' });
  await expect(outputPre).toBeVisible();
  await expect(outputPre).toContainText('"result"');
  await expect(outputPre).toContainText('"ok"');
  await expect(outputPre).toContainText('"echo"');
  await expect(outputPre).toContainText('hello from e2e');

  // 12. Delete skill (cleanup via UI: Delete skill -> Confirm)
  const sidebarSkillCard = page.locator('div[draggable]').filter({ hasText: SKILL_NAME }).first();
  await sidebarSkillCard.hover();
  await sidebarSkillCard.getByRole('button', { name: 'Delete skill' }).click();
  await sidebarSkillCard.getByTestId('skill-delete-confirm').click();
  await expect(page.getByTestId('skill-delete-confirm')).not.toBeVisible({ timeout: 3000 });
});
