import { render, screen } from '@testing-library/react';
import App from './App';

test('sends a visitor without a session to sign in', async () => {
  window.history.pushState({}, '', '/home');
  render(<App />);
  expect(await screen.findByText(/sign in/i)).toBeInTheDocument();
});
