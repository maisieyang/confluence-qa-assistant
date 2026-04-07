import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeSelector } from '../ThemeSelector';

// Mock the useTheme hook
jest.mock('@/hooks/useTheme');
import { useTheme } from '@/hooks/useTheme';

const mockUseTheme = useTheme as jest.MockedFunction<typeof useTheme>;

describe('ThemeSelector', () => {
  const mockSetTheme = jest.fn();

  beforeEach(() => {
    mockSetTheme.mockReset();
    mockUseTheme.mockReturnValue({
      theme: 'system',
      resolvedTheme: 'light',
      setTheme: mockSetTheme,
      mounted: true,
    });
  });

  it('renders three theme buttons', () => {
    render(<ThemeSelector />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(3);
  });

  it('renders Light, Dark and Auto options', () => {
    render(<ThemeSelector />);
    expect(screen.getByText(/Light/)).toBeInTheDocument();
    expect(screen.getByText(/Dark/)).toBeInTheDocument();
    expect(screen.getByText(/Auto/)).toBeInTheDocument();
  });

  it('renders the Theme label', () => {
    render(<ThemeSelector />);
    expect(screen.getByText('Theme')).toBeInTheDocument();
  });

  it('calls setTheme with dark when Dark button is clicked', async () => {
    render(<ThemeSelector />);
    const darkButton = screen.getByText(/Dark/);

    await userEvent.click(darkButton);

    expect(mockSetTheme).toHaveBeenCalledTimes(1);
    expect(mockSetTheme).toHaveBeenCalledWith('dark');
  });

  it('calls setTheme with light when Light button is clicked', async () => {
    render(<ThemeSelector />);
    const lightButton = screen.getByText(/Light/);

    await userEvent.click(lightButton);

    expect(mockSetTheme).toHaveBeenCalledWith('light');
  });

  it('calls setTheme with system when Auto button is clicked', async () => {
    render(<ThemeSelector />);
    const autoButton = screen.getByText(/Auto/);

    await userEvent.click(autoButton);

    expect(mockSetTheme).toHaveBeenCalledWith('system');
  });

  it('disables buttons when not mounted', () => {
    mockUseTheme.mockReturnValue({
      theme: 'system',
      resolvedTheme: 'light',
      setTheme: mockSetTheme,
      mounted: false,
    });

    render(<ThemeSelector />);
    const buttons = screen.getAllByRole('button');
    buttons.forEach(btn => expect(btn).toBeDisabled());
  });

  it('enables buttons when mounted', () => {
    render(<ThemeSelector />);
    const buttons = screen.getAllByRole('button');
    buttons.forEach(btn => expect(btn).toBeEnabled());
  });
});
