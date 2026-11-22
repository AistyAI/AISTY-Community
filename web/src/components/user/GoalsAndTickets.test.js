import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

jest.mock('react-router-dom', () => ({ useSearchParams: () => [new URLSearchParams(), () => {}] }));
jest.mock('../../ui', () => ({ ...jest.requireActual('../../ui'), useToast: () => ({ addToast: () => {} }) }));
jest.mock('../utils/verifiedCall', () => ({
  fetchWithHankoAuth: (url) => Promise.resolve(url.includes('/comments') ? { comments: [] } : {
    company: {
      goals: [{ goalId: 'g1', title: 'Grow pipeline', description: 'More leads', target: '50' }],
      tickets: [
        { ticketId: 't1', title: 'Draft outreach email', status: 'open', goalId: 'g1', responses: [{ text: 'Hello <think>x</think>world' }] },
        { ticketId: 't2', title: 'Review CRM data', status: 'completed', goalId: 'g1' },
      ],
    },
  }),
  authorizedFetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }),
}));

test('goals and tickets views render', async () => {
  const GoalsAndTickets = require('./GoalsAndTickets').default;
  render(<GoalsAndTickets />);
  await screen.findAllByText('Draft outreach email');
  fireEvent.click(screen.getAllByText('Draft outreach email')[0]);
  fireEvent.click(screen.getAllByRole('button', { name: 'Close' })[0]);
  fireEvent.click(screen.getByTitle('List view'));
  await screen.findByDisplayValue('Grow pipeline');
  screen.getByRole('table', { name: 'Grow pipeline' });
  fireEvent.click(screen.getByText('+ Create'));
  fireEvent.click(screen.getByText(/New Goal/));
  screen.getByText('Create New Goal');
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  fireEvent.click(screen.getByText('+ Create'));
  fireEvent.click(screen.getByText(/New Ticket/));
  screen.getByText('Create New Task');
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  fireEvent.change(screen.getByPlaceholderText('Search tasks...'), { target: { value: 'CRM' } });
  fireEvent.click(screen.getByTitle('Kanban view'));
  expect(screen.queryByText('Draft outreach email')).toBeNull();
  screen.getByText('Review CRM data');
});
