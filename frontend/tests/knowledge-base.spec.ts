import { test, expect } from '@playwright/test';

/**
 * E2E: Create agent, open KB modal, create knowledge base, upload document,
 * verify document status, delete KB, cleanup agent.
 * Prerequisites: Backend (uvicorn) and MongoDB running.
 */

const AGENT_NAME = `E2E KB Agent ${Date.now()}`;
const KB_NAME = `E2E Knowledge Base ${Date.now()}`;

test('create knowledge base, upload document, verify, delete', async ({ page, request }) => {
  test.setTimeout(90000);

  // 1. Create an agent via API (for embedding config)
  const agentRes = await request.post('/api/agents', {
    data: {
      name: AGENT_NAME,
      provider: 'openai',
      model_id: 'text-embedding-3-small',
      api_key: 'dummy-api-key-for-e2e',
    },
  });
  test.skip(agentRes.status() !== 200, 'Backend not running - start uvicorn in backend/ before E2E');
  const agent = await agentRes.json();
  const agentId = agent._id || agent.id;

  page.on('dialog', (dialog) => dialog.accept());
  await page.goto('/');

  // 2. Open Knowledge Bases modal
  await page.getByRole('button', { name: 'Knowledge Bases' }).click();
  await expect(page.getByText('Knowledge Bases')).toBeVisible();
  await expect(page.getByText('Manage documents for RAG retrieval')).toBeVisible();

  // 3. Verify empty state
  await expect(page.getByText('No knowledge bases yet')).toBeVisible();

  // 4. Create new knowledge base
  await page.getByRole('button', { name: 'New Knowledge Base' }).click();
  await page.getByTestId('kb-name-input').fill(KB_NAME);
  await page.getByTestId('kb-description-input').fill('E2E test knowledge base');

  // Select the agent we created
  const agentSelect = page.getByTestId('kb-agent-select');
  await agentSelect.selectOption({ label: new RegExp(AGENT_NAME) });

  // Save
  await page.getByTestId('kb-save-btn').click();
  await expect(page.getByText('Saved')).toBeVisible({ timeout: 5000 });

  // 5. Verify KB appears in the left list
  const kbButton = page.locator('button').filter({ hasText: KB_NAME }).first();
  await expect(kbButton).toBeVisible({ timeout: 5000 });
  await expect(kbButton).toContainText('0 docs');

  // 6. Verify documents section is visible (empty state)
  await expect(page.getByText('No documents yet')).toBeVisible();

  // 7. Upload a small txt file
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles({
    name: 'test-doc.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('This is a test document for the knowledge base. It contains sample text for embedding and retrieval testing.'),
  });

  // Wait for upload to complete (doc should appear in list)
  // Note: With dummy API key, the document will likely end up in "error" status
  // because the embedding call will fail. That's expected for E2E without real keys.
  await expect(page.getByText('test-doc.txt')).toBeVisible({ timeout: 15000 });

  // 8. Verify search test section is visible
  await expect(page.getByText('Search Test')).toBeVisible();
  await expect(page.getByPlaceholder('Enter a query to test retrieval...')).toBeVisible();

  // 9. Delete the knowledge base
  await page.getByTestId('kb-delete-btn').click();
  await expect(page.getByText('Delete this knowledge base?')).toBeVisible();
  await page.getByTestId('kb-delete-confirm').click();

  // 10. Verify KB is removed from list
  await expect(kbButton).not.toBeVisible({ timeout: 5000 });

  // 11. Close modal
  await page.getByTestId('kb-modal-close').click();

  // 12. Cleanup: delete agent via API
  await request.delete(`/api/agents/${agentId}`);
});

test('knowledge base modal opens and closes correctly', async ({ page, request }) => {
  test.setTimeout(30000);

  // Quick check that backend is running
  const healthCheck = await request.get('/api/agents');
  test.skip(healthCheck.status() !== 200, 'Backend not running');

  await page.goto('/');

  // Open modal
  await page.getByRole('button', { name: 'Knowledge Bases' }).click();
  await expect(page.getByText('Knowledge Bases')).toBeVisible();

  // Verify initial state: no form shown
  await expect(page.getByText('Select a knowledge base or create a new one')).toBeVisible();

  // Close modal
  await page.getByTestId('kb-modal-close').click();
  await expect(page.getByText('Manage documents for RAG retrieval')).not.toBeVisible();
});

test('knowledge base form validation', async ({ page, request }) => {
  test.setTimeout(30000);

  const healthCheck = await request.get('/api/agents');
  test.skip(healthCheck.status() !== 200, 'Backend not running');

  await page.goto('/');

  // Open modal and click New
  await page.getByRole('button', { name: 'Knowledge Bases' }).click();
  await page.getByRole('button', { name: 'New Knowledge Base' }).click();

  // Try to save without name
  await page.getByTestId('kb-save-btn').click();
  await expect(page.getByText('Name is required')).toBeVisible();

  // Fill name but no agent
  await page.getByTestId('kb-name-input').fill('Test KB');
  await page.getByTestId('kb-agent-select').selectOption({ value: '' });
  await page.getByTestId('kb-save-btn').click();
  await expect(page.getByText('Embedding agent is required')).toBeVisible();

  // Close
  await page.getByTestId('kb-modal-close').click();
});
