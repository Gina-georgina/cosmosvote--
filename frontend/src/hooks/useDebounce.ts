/**
 * useDebounce — returns a debounced copy of `value` that only updates after
 * `delay` ms of inactivity.
 */
import { useEffect, useState } from 'react';

export function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

/**
 * Unit test for debounce integration with the proposal list search input.
 *
 * Verifies that:
 *  - typing into the search input does not immediately update filtered results
 *  - filtered results only update after 300 ms of inactivity
 *  - `useDebounce` is reused by the proposal list component
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { useDebounce } from './useDebounce';

// Mock the proposal list component to exercise the debounce integration.
// The component under test is expected to use `useDebounce` with a 300 ms delay.
jest.mock('./useDebounce', () => {
  const actual = jest.requireActual<typeof import('./useDebounce')>('./useDebounce');
  return {
    ...actual,
    useDebounce: jest.fn(actual.useDebounce),
  };
});

import { ProposalList } from '../components/ProposalList';

const mockedUseDebounce = useDebounce as jest.MockedFunction<typeof useDebounce>;

const PROPOSALS = [
  { id: '1', title: 'Alpha proposal' },
  { id: '2', title: 'Beta proposal' },
  { id: '3', title: 'Gamma proposal' },
];

describe('ProposalList search debounce integration', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockedUseDebounce.mockClear();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('reuses the useDebounce hook', () => {
    render(<ProposalList proposals={PROPOSALS} />);
    expect(mockedUseDebounce).toHaveBeenCalled();
  });

  it('does not update filtered results until 300 ms of inactivity', () => {
    render(<ProposalList proposals={PROPOSALS} />);

    const input = screen.getByRole('searchbox');
    fireEvent.change(input, { target: { value: 'Beta' } });

    // Immediately after typing, results should still show all proposals.
    expect(screen.getByText('Alpha proposal')).toBeInTheDocument();
    expect(screen.getByText('Beta proposal')).toBeInTheDocument();
    expect(screen.getByText('Gamma proposal')).toBeInTheDocument();

    // Advance less than the debounce delay — results should not change yet.
    act(() => {
      jest.advanceTimersByTime(299);
    });
    expect(screen.getByText('Alpha proposal')).toBeInTheDocument();
    expect(screen.getByText('Gamma proposal')).toBeInTheDocument();

    // Advance past the debounce delay — results should now be filtered.
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(screen.queryByText('Alpha proposal')).not.toBeInTheDocument();
    expect(screen.getByText('Beta proposal')).toBeInTheDocument();
    expect(screen.queryByText('Gamma proposal')).not.toBeInTheDocument();
  });

  it('resets the debounce timer on each keystroke', () => {
    render(<ProposalList proposals={PROPOSALS} />);

    const input = screen.getByRole('searchbox');

    fireEvent.change(input, { target: { value: 'B' } });
    act(() => {
      jest.advanceTimersByTime(200);
    });

    fireEvent.change(input, { target: { value: 'Be' } });
    act(() => {
      jest.advanceTimersByTime(200);
    });

    fireEvent.change(input, { target: { value: 'Beta' } });

    // 400 ms elapsed since first keystroke, but only 0 ms since last one.
    expect(screen.getByText('Alpha proposal')).toBeInTheDocument();
    expect(screen.getByText('Gamma proposal')).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(screen.queryByText('Alpha proposal')).not.toBeInTheDocument();
    expect(screen.getByText('Beta proposal')).toBeInTheDocument();
    expect(screen.queryByText('Gamma proposal')).not.toBeInTheDocument();
  });
});