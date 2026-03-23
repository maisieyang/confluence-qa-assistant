import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ScrollToBottomButton } from '../ScrollToBottomButton';

describe('ScrollToBottomButton', () => {
  it('renders nothing when isVisible is false', () => {
    const { container } = render(<ScrollToBottomButton onClick={jest.fn()} isVisible={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a button when isVisible is true', () => {
    render(<ScrollToBottomButton onClick={jest.fn()} isVisible={true} />);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('has the correct title attribute', () => {
    render(<ScrollToBottomButton onClick={jest.fn()} isVisible={true} />);
    expect(screen.getByRole('button')).toHaveAttribute('title', 'Scroll to bottom');
  });

  it('calls onClick when the button is clicked', async () => {
    const handleClick = jest.fn();
    render(<ScrollToBottomButton onClick={handleClick} isVisible={true} />);

    await userEvent.click(screen.getByRole('button'));

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('applies the className prop', () => {
    render(<ScrollToBottomButton onClick={jest.fn()} isVisible={true} className="extra-class" />);
    expect(screen.getByRole('button')).toHaveClass('extra-class');
  });

  it('does not render the button when toggled from visible to hidden', () => {
    const { rerender } = render(<ScrollToBottomButton onClick={jest.fn()} isVisible={true} />);
    expect(screen.getByRole('button')).toBeInTheDocument();

    rerender(<ScrollToBottomButton onClick={jest.fn()} isVisible={false} />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
