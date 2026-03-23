import { render, screen } from '@testing-library/react';
import { CalloutBox } from '../CalloutBox';

describe('CalloutBox', () => {
  it('renders children content', () => {
    render(<CalloutBox type="info"><p>Info message</p></CalloutBox>);
    expect(screen.getByText('Info message')).toBeInTheDocument();
  });

  it('renders info type with correct classes', () => {
    const { container } = render(<CalloutBox type="info"><p>Info</p></CalloutBox>);
    const box = container.firstChild as HTMLElement;
    expect(box).toHaveClass('bg-blue-50');
    expect(box).toHaveClass('border-blue-400');
    expect(box).toHaveClass('text-blue-800');
  });

  it('renders warning type with correct classes', () => {
    const { container } = render(<CalloutBox type="warning"><p>Warn</p></CalloutBox>);
    const box = container.firstChild as HTMLElement;
    expect(box).toHaveClass('bg-yellow-50');
    expect(box).toHaveClass('border-yellow-400');
    expect(box).toHaveClass('text-yellow-800');
  });

  it('renders success type with correct classes', () => {
    const { container } = render(<CalloutBox type="success"><p>Done</p></CalloutBox>);
    const box = container.firstChild as HTMLElement;
    expect(box).toHaveClass('bg-green-50');
    expect(box).toHaveClass('border-green-400');
    expect(box).toHaveClass('text-green-800');
  });

  it('renders error type with correct classes', () => {
    const { container } = render(<CalloutBox type="error"><p>Err</p></CalloutBox>);
    const box = container.firstChild as HTMLElement;
    expect(box).toHaveClass('bg-red-50');
    expect(box).toHaveClass('border-red-400');
    expect(box).toHaveClass('text-red-800');
  });

  it('renders the info icon for type info', () => {
    render(<CalloutBox type="info"><p>Info</p></CalloutBox>);
    expect(screen.getByText('🔵')).toBeInTheDocument();
  });

  it('renders the warning icon for type warning', () => {
    render(<CalloutBox type="warning"><p>Warn</p></CalloutBox>);
    expect(screen.getByText('⚠️')).toBeInTheDocument();
  });

  it('renders the success icon for type success', () => {
    render(<CalloutBox type="success"><p>Done</p></CalloutBox>);
    expect(screen.getByText('✅')).toBeInTheDocument();
  });

  it('renders the error icon for type error', () => {
    render(<CalloutBox type="error"><p>Err</p></CalloutBox>);
    expect(screen.getByText('❌')).toBeInTheDocument();
  });

  it('applies additional className prop', () => {
    const { container } = render(
      <CalloutBox type="info" className="extra-class"><p>Info</p></CalloutBox>
    );
    expect(container.firstChild).toHaveClass('extra-class');
  });

  it('renders complex children', () => {
    render(
      <CalloutBox type="success">
        <strong>Bold</strong> and <em>italic</em>
      </CalloutBox>
    );
    expect(screen.getByText('Bold')).toBeInTheDocument();
    expect(screen.getByText('italic')).toBeInTheDocument();
  });
});
