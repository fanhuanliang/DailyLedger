import { buildAuthorizedTestApp } from './helpers/testApp';

describe('Settings API: supporting read-only endpoint for household timezone/currency', () => {
  test('returns the household timezone and currency without financial data', async () => {
    const { agent } = buildAuthorizedTestApp();
    const response = await agent.get('/api/v1/settings');
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ household_timezone: 'America/Los_Angeles', currency: 'USD' });
  });
});
