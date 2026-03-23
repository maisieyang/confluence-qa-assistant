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

  it('renders a select element', () => {
    render(<ThemeSelector />);
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('renders a label with the text 主题', () => {
    render(<ThemeSelector />);
    expect(screen.getByText('主题')).toBeInTheDocument();
  });

  it('renders all three theme options', () => {
    render(<ThemeSelector />);
    expect(screen.getByRole('option', { name: /Light/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Dark/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /System/i })).toBeInTheDocument();
  });

  it('shows the current theme as the selected option when mounted', () => {
    mockUseTheme.mockReturnValue({
      theme: 'dark',
      resolvedTheme: 'dark',
      setTheme: mockSetTheme,
      mounted: true,
    });

    render(<ThemeSelector />);
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('dark');
  });

  it('defaults to system when not yet mounted', () => {
    mockUseTheme.mockReturnValue({
      theme: 'dark',
      resolvedTheme: 'dark',
      setTheme: mockSetTheme,
      mounted: false,
    });

    render(<ThemeSelector />);
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('system');
  });

  it('is disabled when not yet mounted', () => {
    mockUseTheme.mockReturnValue({
      theme: 'system',
      resolvedTheme: 'light',
      setTheme: mockSetTheme,
      mounted: false,
    });

    render(<ThemeSelector />);
    expect(screen.getByRole('combobox')).toBeDisabled();
  });

  it('is enabled when mounted', () => {
    render(<ThemeSelector />);
    expect(screen.getByRole('combobox')).toBeEnabled();
  });

  it('calls setTheme with the selected value when changed', async () => {
    render(<ThemeSelector />);
    const select = screen.getByRole('combobox');

    await userEvent.selectOptions(select, 'dark');

    expect(mockSetTheme).toHaveBeenCalledTimes(1);
    expect(mockSetTheme).toHaveBeenCalledWith('dark');
  });

  it('calls setTheme with light when light option is selected', async () => {
    render(<ThemeSelector />);
    const select = screen.getByRole('combobox');

    await userEvent.selectOptions(select, 'light');

    expect(mockSetTheme).toHaveBeenCalledWith('light');
  });
});
