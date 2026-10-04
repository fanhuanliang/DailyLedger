import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../src/App';
import { describe, test, expect } from 'vitest';

describe('Foundation: accessible navigation without fake records', () => {
 test('provides every sheet and a persistent Add transaction action', () => {
  render(<MemoryRouter><App /></MemoryRouter>);
  const nav = screen.getByRole('navigation', { name: 'Ledger sheets' });
  expect(nav).toBeInTheDocument();
  for (const label of ['Dashboard','Records','Accounts','Categories','Budgets','Goals','Reminders','Reports']) expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Add transaction' })).toHaveAttribute('href', '/records?new=1');
  expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
 });
 test('switches to the Records sheet and explains the empty state', async () => {
  render(<MemoryRouter><App /></MemoryRouter>);
  await userEvent.click(screen.getByRole('link', { name: 'Records' }));
  expect(screen.getByRole('heading', { name: 'Records' })).toBeInTheDocument();
  expect(screen.getByText('Your transactions will appear here.')).toBeInTheDocument();
 });
});
