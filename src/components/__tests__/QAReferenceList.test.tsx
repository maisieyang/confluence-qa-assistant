import React from 'react';
import { render, screen } from '@testing-library/react';
import { QAReferenceList } from '../QAReferenceList';
import type { ReferenceLink } from '../ChatWindow/types';

describe('QAReferenceList', () => {
  it('renders nothing when references array is empty', () => {
    const { container } = render(<QAReferenceList references={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders references with URLs as anchor links', () => {
    const references: ReferenceLink[] = [
      { index: 1, title: 'Confluence Home', url: 'https://example.com/wiki' },
      { index: 2, title: 'Getting Started', url: 'https://example.com/wiki/start' },
    ];
    render(<QAReferenceList references={references} />);

    const link1 = screen.getByRole('link', { name: 'Confluence Home' });
    expect(link1).toHaveAttribute('href', 'https://example.com/wiki');
    expect(link1).toHaveAttribute('target', '_blank');

    const link2 = screen.getByRole('link', { name: 'Getting Started' });
    expect(link2).toHaveAttribute('href', 'https://example.com/wiki/start');
  });

  it('renders references without URLs as plain text', () => {
    const references: ReferenceLink[] = [
      { index: 1, title: 'Document Without URL' },
    ];
    render(<QAReferenceList references={references} />);

    expect(screen.getByText('Document Without URL')).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('renders reference index numbers', () => {
    const references: ReferenceLink[] = [
      { index: 1, title: 'First Reference', url: 'https://example.com/1' },
      { index: 2, title: 'Second Reference', url: 'https://example.com/2' },
    ];
    render(<QAReferenceList references={references} />);

    expect(screen.getByText('[1]')).toBeInTheDocument();
    expect(screen.getByText('[2]')).toBeInTheDocument();
  });

  it('renders the section heading', () => {
    const references: ReferenceLink[] = [
      { index: 1, title: 'Some Reference', url: 'https://example.com' },
    ];
    render(<QAReferenceList references={references} />);

    expect(screen.getByText('来源 References')).toBeInTheDocument();
  });

  it('renders mixed URL and non-URL references', () => {
    const references: ReferenceLink[] = [
      { index: 1, title: 'With URL', url: 'https://example.com' },
      { index: 2, title: 'Without URL' },
    ];
    render(<QAReferenceList references={references} />);

    expect(screen.getByRole('link', { name: 'With URL' })).toBeInTheDocument();
    expect(screen.getByText('Without URL')).toBeInTheDocument();
  });
});
