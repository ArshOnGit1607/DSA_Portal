import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DsaProvider } from '@dsa-portal/ui-core';
import { mockServer } from '@dsa-portal/ui-core/mocks/node';
import { App } from './App';
import { dsa } from './platform';
import { ResultsPanel } from './components/ResultsPanel';

const { server, mock } = mockServer('http://api.test');
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());

const renderApp = (hash = '#/') => {
  window.location.hash = hash;
  return render(<DsaProvider value={dsa}><App /></DsaProvider>);
};

describe('web app', () => {
  it('sends anonymous users to login, signs in, then shows the topic picker', async () => {
    await dsa.stores.auth.getState().restore(); // no session yet → anonymous
    renderApp('#/');
    fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'demo@dsa.dev' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Invalid email or password');

    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'demo-pass-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('heading', { name: 'Practice' })).toBeTruthy();
    await waitFor(() => expect(screen.getByRole('option', { name: 'Graphs' })).toBeTruthy());
  });

  it('stats page shows the empty state, then numbers after a solve', async () => {
    const { unmount } = renderApp('#/stats');
    expect(await screen.findByText(/No attempts yet/)).toBeTruthy();
    unmount();
    await dsa.stores.submission.getState().submit('two-sum', 'function solve() { return [0, 1]; }');
    renderApp('#/stats');
    expect(await screen.findByText('1/5')).toBeTruthy();
    expect(screen.getAllByText('100%')).toHaveLength(2); // accuracy tile + table row
    expect(screen.getByRole('heading', { name: 'By topic' })).toBeTruthy();
    expect(mock.state.solved.has('two-sum')).toBe(true);
  });
});

describe('ResultsPanel', () => {
  it('shows per-test rows with errors', () => {
    render(<ResultsPanel view={{ kind: 'submit', status: 'done', passed: 1, total: 2, results: [
      { testCaseIndex: 0, passed: true, actual: '1', expected: '1' },
      { testCaseIndex: 1, passed: false, actual: '', expected: '2', error: 'boom' },
    ] }} />);
    expect(screen.getByText('Wrong answer')).toBeTruthy();
    expect(screen.getByText('Error: boom')).toBeTruthy();
    expect(screen.getAllByRole('row')).toHaveLength(3);
  });
});
