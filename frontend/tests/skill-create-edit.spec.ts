import { test, expect } from '@playwright/test';

/**
 * E2E: Create skill via API, find it on page, click edit, save, delete (cleanup).
 * Prerequisites: Backend (uvicorn) and MongoDB running.
 */

test('create skill, find on page, edit, save, delete', async ({ page, request }) => {
  const skillName = `E2E Edit ${Date.now()}`;

  const skillData = {
    name: skillName,
    type: 'tool',
    description: 'Original description',
    implementation: {
      executor: 'python_eval',
      config: {
        code: `def execute(inputs):
  return {'done': True}`
      }
    }
  };

  const res = await request.post('/api/skills', { data: skillData });
  test.skip(res.status() !== 200, 'Backend not running - start uvicorn in backend/ before E2E');

  await page.goto('/');

  // 1. Wait for skills to load and find the skill card
  const skillCard = page.locator('div[draggable]').filter({ hasText: skillName }).first();
  await expect(skillCard).toBeVisible({ timeout: 10000 });

  // 2. Hover to reveal Edit button, then click Edit
  await skillCard.hover();
  await skillCard.getByRole('button', { name: 'Edit skill' }).click();

  // 3. Edit modal opens - change description
  await expect(page.getByText('Edit Skill')).toBeVisible();
  const descriptionField = page.getByTestId('edit-skill-description');
  await descriptionField.fill('Updated by E2E test');

  // 4. Save
  await page.getByRole('button', { name: 'Save Changes' }).click();

  // 5. Modal closes, skill list refreshes - verify updated description
  await expect(page.getByText('Edit Skill')).not.toBeVisible({ timeout: 3000 });
  await expect(skillCard).toBeVisible();
  await expect(skillCard).toContainText('Updated by E2E test');

  // 6. Delete skill (cleanup - unique name ensures no leftover from other runs)
  await skillCard.hover();
  await skillCard.getByRole('button', { name: 'Delete skill' }).click();
  await skillCard.getByTestId('skill-delete-confirm').click();
  await expect(skillCard).not.toBeVisible({ timeout: 5000 });
});
