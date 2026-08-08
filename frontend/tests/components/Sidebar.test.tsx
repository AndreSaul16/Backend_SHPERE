import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar } from '../../src/components/sidebar/Sidebar';
import { useChatStore } from '../../src/store/useChatStore';
import { useAuth } from '../../src/contexts/AuthContext';

// Mock react-router-dom's useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock AuthContext
vi.mock('../../src/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock useUserAvatar hook
vi.mock('../../src/hooks/useUserAvatar', () => ({
  useUserAvatar: () => null,
}));

// Mock framer-motion
vi.mock('framer-motion', () => {
  const Component = ({ children, ...props }: any) => {
    const { initial, animate, exit, transition, layoutId, layout, variants, whileHover, whileTap, whileFocus, ...domProps } = props;
    return <div {...domProps}>{children}</div>;
  };
  return {
    useReducedMotion: () => false,
        AnimatePresence: ({ children }: any) => children,
    motion: { div: Component, span: Component, h3: Component, p: Component, header: Component, nav: Component, button: Component },
  };
});

describe('Sidebar — Billing Link (Task 4.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useAuth as any).mockReturnValue({
      user: { uid: 'test-uid', email: 'test@example.com', displayName: 'Test User', photoURL: null },
      loading: false,
    });
    useChatStore.setState({
      sessions: [],
      currentSessionId: null,
      streamingSessionIds: [],
      coreAgents: [],
      customAgents: [],
    });
  });

  it('shows a "Facturación" link in sidebar navigation', () => {
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    );
    // The billing link should be in the sidebar footer section
    const billingLink = screen.getByText('Facturación');
    expect(billingLink).toBeDefined();
  });

  it('billing link points to /billing', () => {
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    );
    // The component uses a react-router <Link to="/billing"> (no navigate() call),
    // so assert the resulting anchor's href instead of a navigate() invocation.
    const anchor = screen.getByText('Facturación').closest('a');
    expect(anchor).not.toBeNull();
    expect(anchor).toHaveAttribute('href', '/billing');
  });

  it('billing link has a credit-card or receipt icon', () => {
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    );
    // The billing link should have an SVG icon (from lucide-react)
    const billingElement = screen.getByText('Facturación').closest('a') || screen.getByText('Facturación').parentElement;
    // Check that an SVG exists nearby (lucide icons are SVGs)
    const svg = billingElement?.querySelector('svg');
    expect(svg).toBeTruthy();
  });
});

describe('Sidebar — Dynamic User Info (Task 4.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useChatStore.setState({
      sessions: [],
      currentSessionId: null,
      streamingSessionIds: [],
      coreAgents: [],
      customAgents: [],
    });
  });

  it('shows displayName from auth context when authenticated', () => {
    (useAuth as any).mockReturnValue({
      user: { uid: 'uid-1', email: 'maria@test.com', displayName: 'María García', photoURL: null },
      loading: false,
    });

    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    );

    expect(screen.getByText('María García')).toBeDefined();
  });

  it('shows email as fallback when displayName is null', () => {
    (useAuth as any).mockReturnValue({
      user: { uid: 'uid-2', email: 'john@example.com', displayName: null, photoURL: null },
      loading: false,
    });

    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    );

    // When displayName is null the email is used both as the primary name
    // (displayName || email) and as the secondary line, so it appears twice.
    const matches = screen.getAllByText('john@example.com');
    expect(matches.length).toBeGreaterThan(0);
  });

  it('shows initials in avatar when no photoURL', () => {
    (useAuth as any).mockReturnValue({
      user: { uid: 'uid-3', email: 'ana@gmail.com', displayName: 'Ana López', photoURL: null },
      loading: false,
    });

    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    );

    // Should show initials "AL" as fallback (instead of hardcoded "S")
    expect(screen.getByText('AL')).toBeDefined();
  });

  it('shows nothing or minimal info when logged out', () => {
    (useAuth as any).mockReturnValue({
      user: null,
      loading: false,
    });

    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    );

    // Should NOT show the hardcoded "Saúl" name
    expect(screen.queryByText('Saúl')).toBeNull();
    // Should NOT show the hardcoded "Admin" role
    expect(screen.queryByText('Admin')).toBeNull();
  });

  it('handles user with single-word name for initials', () => {
    (useAuth as any).mockReturnValue({
      user: { uid: 'uid-4', email: 'neo@matrix.com', displayName: 'Neo', photoURL: null },
      loading: false,
    });

    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    );

    // Single name → first letter as initial
    expect(screen.getByText('N')).toBeDefined();
  });
});
