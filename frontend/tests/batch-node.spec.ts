import { test, expect } from '@playwright/test';

/**
 * E2E: Create workflow with batch node, configure batch mode, execute, verify parallel results.
 * Prerequisites: Backend (uvicorn) and MongoDB running.
 * 
 * Note: Drag-and-drop in HTML5 is not fully supported in Firefox/WebKit for this test.
 * Run with: npx playwright test tests/batch-node.spec.ts --project=chromium
 */

const SKILL_NAME = 'E2E Batch Test Skill';

test('batch node: execute parallel items, verify aggregated results', async ({ page, request, browserName }) => {
  test.skip(browserName !== 'chromium', 'HTML5 drag-and-drop only reliable in Chromium');
  test.setTimeout(120000);

  // 1. Create skill via API
  const skillData = {
    name: SKILL_NAME,
    type: 'tool',
    description: 'Skill for batch E2E test',
    implementation: {
      executor: 'python_eval',
      config: {
        code: `def execute(inputs):
  query = inputs.get('query', inputs.get('item', 'unknown'))
  return {'processed': query, 'length': len(query)}`
      }
    }
  };
  const skillRes = await request.post('/api/skills', { data: skillData });
  test.skip(skillRes.status() !== 200, 'Backend not running');
  const createdSkill = await skillRes.json();
  const skillId = createdSkill._id || createdSkill.id;

  page.on('dialog', (dialog) => dialog.accept());
  await page.goto('/');

  try {
    // 2. Create new workflow
    await page.getByRole('button', { name: 'More actions' }).click();
    await page.getByRole('button', { name: 'Create New Flow' }).click();

    // 3. Add Start Node
    const canvas = page.locator('.react-flow').first();
    const canvasBox = await canvas.boundingBox();
    if (!canvasBox) throw new Error('Canvas not found');

    const startCard = page.locator('div[draggable]').filter({ hasText: 'Start Node' }).first();
    await startCard.waitFor({ state: 'visible' });
    const startBox = await startCard.boundingBox();
    if (!startBox) throw new Error('Start card not found');
    await page.mouse.move(startBox.x + startBox.width / 2, startBox.y + startBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(canvasBox.x + 150, canvasBox.y + 150, { steps: 10 });
    await page.mouse.up();
    await expect(page.locator('.react-flow__node').filter({ hasText: 'Start' })).toBeVisible({ timeout: 5000 });

    // 4. Add Skill Node
    const skillCard = page.locator('div[draggable]').filter({ hasText: SKILL_NAME }).first();
    await skillCard.waitFor({ state: 'visible' });
    await skillCard.scrollIntoViewIfNeeded();
    await expect(skillCard).toBeVisible();
    const skillBox = await skillCard.boundingBox();
    if (!skillBox) throw new Error('Skill card not found');
    await page.mouse.move(skillBox.x + skillBox.width / 2, skillBox.y + skillBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(canvasBox.x + 450, canvasBox.y + 150, { steps: 10 });
    await page.mouse.up();
    await expect(page.locator('.react-flow__node').filter({ hasText: SKILL_NAME })).toBeVisible({ timeout: 5000 });

    // 5. Connect Start -> Skill
    const startNode = page.locator('.react-flow__node').filter({ hasText: 'Start' }).first();
    const skillNode = page.locator('.react-flow__node').filter({ hasText: SKILL_NAME }).first();
    const startHandle = startNode.locator('[data-testid="start-handle"], [class*="react-flow__handle"]').first();
    const skillHandle = skillNode.locator('[data-testid="puppy-handle-target"], [class*="react-flow__handle"]').first();
    await startHandle.dragTo(skillHandle);
    // Wait for edge to appear
    await expect(page.locator('.react-flow__edge')).toBeVisible({ timeout: 3000 });

    // 6. Configure Start node: multi-line input (one item per line)
    await startNode.getByRole('button', { name: 'Start Node Settings' }).click();
    await expect(page.getByText('Default Input Text')).toBeVisible({ timeout: 3000 });
    await page.getByPlaceholder('Enter the initial prompt or data here...').fill('apple\nbanana\ncherry');
    await page.getByTestId('node-config-save').click();
    await expect(page.getByText('Default Input Text')).not.toBeVisible({ timeout: 3000 });

    // 7. Configure Skill node: enable Batch Mode, disable Require Approval
    await skillNode.hover();
    await skillNode.getByRole('button', { name: 'Node Settings' }).click();

    // Wait for modal to open
    await expect(page.getByText('Node Settings').first()).toBeVisible({ timeout: 5000 });

    // Enable Batch Mode - find the toggle container and click its label
    const batchModeToggle = page.getByText('Batch Mode')
      .locator('xpath=ancestor::div[contains(@class, "justify-between")]')
      .locator('input[type="checkbox"]');
    await batchModeToggle.scrollIntoViewIfNeeded();
    await batchModeToggle.click({ force: true });

    // Disable Require Approval
    const requireApprovalToggle = page.getByText('Require Approval')
      .locator('xpath=ancestor::div[contains(@class, "justify-between")]')
      .locator('input[type="checkbox"]');
    await requireApprovalToggle.scrollIntoViewIfNeeded();
    await requireApprovalToggle.click({ force: true });

    await page.getByTestId('node-config-save').click();
    await expect(page.getByText('Node Settings').first()).not.toBeVisible({ timeout: 3000 });

    // 8. Verify batch node visual indicator
    await expect(skillNode.locator('text=Batch')).toBeVisible({ timeout: 3000 });

    // 8.5 Save workflow before running (dialog is auto-accepted via page.on('dialog'))
    await page.getByRole('button', { name: 'Save' }).click();
    // Wait for save to complete (alert auto-dismissed)
    await page.waitForTimeout(1000);

    // 9. Execute workflow
    await page.getByRole('button', { name: 'Run', exact: true }).click();

    // Wait for either RunConfigModal or workflow to start running
    // The modal appears when manual_input_text is empty
    const runNowBtn = page.getByRole('button', { name: 'Run Now' });
    const modalVisible = await runNowBtn.isVisible({ timeout: 3000 }).catch(() => false);
    
    if (modalVisible) {
      // Modal appeared - need to click Run Now
      await runNowBtn.click();
    }

    // Verify run started - status should change from PENDING
    await expect(page.locator('.react-flow__node').filter({ hasText: SKILL_NAME }).first()).not.toContainText('PENDING', { timeout: 15000 });

    // 10. Wait for completion
    const completedNode = page.locator('.react-flow__node').filter({ hasText: SKILL_NAME }).first();
    await expect(completedNode).toContainText('COMPLETED', { timeout: 60000 });

    // 11. Verify batch results
    await expect(completedNode.getByText('Outputs')).toBeVisible();
    const outputPre = completedNode.locator('pre').first();
    await expect(outputPre).toContainText('results');
    await expect(outputPre).toContainText('apple');
    await expect(outputPre).toContainText('banana');
    await expect(outputPre).toContainText('cherry');
  } finally {
    // Cleanup: delete workflow first, then skill via API
    try {
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
    } catch (e) {
      console.log('Workflow cleanup failed:', e);
    }
    try {
      await request.delete(`/api/skills/${skillId}`);
    } catch (e) {
      console.log('Skill cleanup failed:', e);
    }
  }
});
