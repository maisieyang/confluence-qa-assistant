import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SendButton } from '../SendButton';

describe('SendButton', () => {
  it('renders and responds to click', async () => {
    const handleClick = jest.fn();
    render(<SendButton isLoading={false} disabled={false} onClick={handleClick} />);

    const button = screen.getByRole('button');
    expect(button).toBeEnabled();

    await userEvent.click(button);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('is disabled when disabled prop is true', () => {
    render(<SendButton isLoading={false} disabled={true} onClick={jest.fn()} />);
    expect(screen.getByRole('button')).toBeDisabled();
  });
});
