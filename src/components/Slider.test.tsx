import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Slider } from './Slider';

const DAILY_PRESETS = [1, 3, 5, 10, 20] as const;
const YEARLY_PRESETS = [365, 1100, 1825, 3650, 5000] as const;

describe('Slider', () => {
  it('renders all preset values with the given unit suffix', () => {
    render(<Slider value={5} onChange={() => {}} presets={DAILY_PRESETS} unitSuffix="/day" />);
    for (const v of ['$1', '$3', '$5', '$10', '$20']) {
      expect(screen.getByText(v)).toBeInTheDocument();
    }
    // Unit suffix appears once per chip
    expect(screen.getAllByText('/day').length).toBe(DAILY_PRESETS.length);
  });

  it('marks the current value as checked', () => {
    render(<Slider value={10} onChange={() => {}} presets={DAILY_PRESETS} unitSuffix="/day" />);
    expect(screen.getByRole('radio', { name: /\$10/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: /\$5/ })).toHaveAttribute('aria-checked', 'false');
  });

  it('calls onChange with the new amount when clicked', () => {
    const onChange = vi.fn();
    render(<Slider value={5} onChange={onChange} presets={DAILY_PRESETS} unitSuffix="/day" />);
    fireEvent.click(screen.getByRole('radio', { name: /\$20/ }));
    expect(onChange).toHaveBeenCalledWith(20);
  });

  it('formats large numbers with comma separators', () => {
    render(<Slider value={1825} onChange={() => {}} presets={YEARLY_PRESETS} unitSuffix="/yr" />);
    expect(screen.getByText('$1,825')).toBeInTheDocument();
    expect(screen.getByText('$5,000')).toBeInTheDocument();
  });

  it('uses the provided label', () => {
    render(
      <Slider
        value={5}
        onChange={() => {}}
        presets={DAILY_PRESETS}
        unitSuffix="/day"
        label="Pick a daily amount"
      />,
    );
    expect(screen.getByText('Pick a daily amount')).toBeInTheDocument();
  });
});
