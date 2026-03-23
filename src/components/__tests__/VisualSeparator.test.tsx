import { render, screen } from '@testing-library/react';
import { VisualSeparator } from '../VisualSeparator';

describe('VisualSeparator', () => {
  it('renders an <hr> element when no text is provided', () => {
    const { container } = render(<VisualSeparator />);
    expect(container.querySelector('hr')).toBeInTheDocument();
  });

  it('does not render an <hr> element when text is provided', () => {
    const { container } = render(<VisualSeparator text="OR" />);
    expect(container.querySelector('hr')).toBeNull();
  });

  it('displays the text when text prop is provided', () => {
    render(<VisualSeparator text="Section Break" />);
    expect(screen.getByText('Section Break')).toBeInTheDocument();
  });

  it('renders a flex container with dividers when text is provided', () => {
    const { container } = render(<VisualSeparator text="OR" />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass('flex');
    expect(wrapper).toHaveClass('items-center');
  });

  it('applies className to the <hr> variant', () => {
    const { container } = render(<VisualSeparator className="my-custom" />);
    expect(container.querySelector('hr')).toHaveClass('my-custom');
  });

  it('applies className to the text variant wrapper', () => {
    const { container } = render(<VisualSeparator text="OR" className="my-custom" />);
    expect(container.firstChild).toHaveClass('my-custom');
  });

  it('renders nothing in text when text is an empty string (falls back to hr)', () => {
    const { container } = render(<VisualSeparator text="" />);
    // Empty string is falsy, so the hr variant should render
    expect(container.querySelector('hr')).toBeInTheDocument();
  });
});
