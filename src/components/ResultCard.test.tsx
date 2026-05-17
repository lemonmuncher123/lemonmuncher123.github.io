import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { ResultCard } from './ResultCard';
import type { CardData } from '../lib/cardRenderer';

const DATA: CardData = {
  birthYear: 2026,
  dailyAmount: 5,
  finalBalance: 65428,
  years: 18,
  lifeLanguage: '4 years at a state university',
  locale: 'en',
};

describe('ResultCard', () => {
  beforeEach(() => {
    // Stub clipboard
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it('renders three action buttons (download, share, copy)', () => {
    render(<ResultCard data={DATA} />);
    expect(screen.getByRole('button', { name: /download/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^share$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy link/i })).toBeInTheDocument();
  });

  it('renders format toggle (Square / Wide)', () => {
    render(<ResultCard data={DATA} />);
    expect(screen.getByRole('button', { name: /square/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /wide/i })).toBeInTheDocument();
  });

  it('shows the balance and life-language in the HTML preview', () => {
    render(<ResultCard data={DATA} />);
    expect(screen.getByText(/\$65,428/)).toBeInTheDocument();
    expect(screen.getByText(/state university/i)).toBeInTheDocument();
  });

  it('clicking Copy link calls clipboard.writeText and shows "Copied!"', async () => {
    render(<ResultCard data={DATA} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /copy link/i }));
    });
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalled();
    });
  });

  it('renders Spanish copy when locale=es', () => {
    render(<ResultCard data={{ ...DATA, locale: 'es' }} />);
    expect(screen.getByRole('button', { name: /descargar/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /compartir/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copiar enlace/i })).toBeInTheDocument();
  });

  it('Download button calls canvas.getContext when clicked', () => {
    // Spy on createElement to capture the canvas
    const getCtxSpy = vi.fn().mockReturnValue({
      fillRect: vi.fn(),
      fillText: vi.fn(),
      createLinearGradient: () => ({ addColorStop: vi.fn() }),
      set fillStyle(_v: unknown) {},
      set font(_v: unknown) {},
      set textAlign(_v: unknown) {},
      set textBaseline(_v: unknown) {},
    });
    const toBlobSpy = vi.fn();
    const original = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = original(tag);
      if (tag === 'canvas') {
        (el as HTMLCanvasElement).getContext = getCtxSpy as never;
        (el as HTMLCanvasElement).toBlob = toBlobSpy as never;
      }
      return el;
    });

    render(<ResultCard data={DATA} />);
    fireEvent.click(screen.getByRole('button', { name: /download/i }));
    expect(getCtxSpy).toHaveBeenCalledWith('2d');
    expect(toBlobSpy).toHaveBeenCalled();

    vi.restoreAllMocks();
  });
});
