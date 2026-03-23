import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CollapsibleSection } from '../CollapsibleSection';

describe('CollapsibleSection', () => {
  it('renders the title', () => {
    render(
      <CollapsibleSection title="My Section">
        <p>Content here</p>
      </CollapsibleSection>
    );
    expect(screen.getByText('My Section')).toBeInTheDocument();
  });

  it('is collapsed by default (defaultOpen=false)', () => {
    render(
      <CollapsibleSection title="Section">
        <p>Hidden content</p>
      </CollapsibleSection>
    );
    expect(screen.queryByText('Hidden content')).toBeNull();
  });

  it('is open when defaultOpen is true', () => {
    render(
      <CollapsibleSection title="Section" defaultOpen={true}>
        <p>Visible content</p>
      </CollapsibleSection>
    );
    expect(screen.getByText('Visible content')).toBeInTheDocument();
  });

  it('expands to show content when the header is clicked', async () => {
    render(
      <CollapsibleSection title="Click to Open">
        <p>Revealed content</p>
      </CollapsibleSection>
    );

    expect(screen.queryByText('Revealed content')).toBeNull();
    await userEvent.click(screen.getByRole('button'));
    expect(screen.getByText('Revealed content')).toBeInTheDocument();
  });

  it('collapses when clicked again', async () => {
    render(
      <CollapsibleSection title="Click to Close" defaultOpen={true}>
        <p>Content to hide</p>
      </CollapsibleSection>
    );

    expect(screen.getByText('Content to hide')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button'));
    expect(screen.queryByText('Content to hide')).toBeNull();
  });

  it('applies the className prop', () => {
    const { container } = render(
      <CollapsibleSection title="Test" className="custom-class">
        <p>Content</p>
      </CollapsibleSection>
    );
    expect(container.firstChild).toHaveClass('custom-class');
  });

  it('renders a toggle button with the title text', () => {
    render(
      <CollapsibleSection title="Toggle Me">
        <p>Content</p>
      </CollapsibleSection>
    );
    expect(screen.getByRole('button')).toBeInTheDocument();
    expect(screen.getByRole('button')).toHaveTextContent('Toggle Me');
  });
});
