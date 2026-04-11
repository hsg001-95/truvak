import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import App from '../App';

vi.mock('../components/SplashScreen', () => ({
  default: ({ onDone }) => (
    <button type="button" onClick={onDone}>
      Finish Splash
    </button>
  ),
}));

vi.mock('../pages/Overview', () => ({
  default: () => <div>Overview Mock Content</div>,
}));

describe('App shell', () => {
  test('shows splash first and then main layout route after completion', async () => {
    const user = userEvent.setup();
    render(<App />);

    const doneButton = screen.getByRole('button', { name: /finish splash/i });
    expect(doneButton).toBeInTheDocument();

    await user.click(doneButton);

    expect(await screen.findByText(/Overview Mock Content/i)).toBeInTheDocument();
  });
});
