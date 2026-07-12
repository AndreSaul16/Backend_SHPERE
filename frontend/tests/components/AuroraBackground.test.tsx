import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { AuroraBackground } from '../../src/components/AuroraBackground';

// Mock framer-motion so the animated blobs render as plain <div>s in jsdom,
// preserving their className for structural assertions.
vi.mock('framer-motion', () => {
    const Div = ({ children, ...props }: any) => {
        const { animate, transition, initial, exit, ...domProps } = props;
        return <div {...domProps}>{children}</div>;
    };
    return { motion: { div: Div }, useReducedMotion: () => false };
});

describe('AuroraBackground Animation Component', () => {
    it('renders the animated container and blobs', () => {
        const { container } = render(<AuroraBackground />);

        // Root container
        const mainDiv = container.firstChild as HTMLElement;
        expect(mainDiv).toBeDefined();
        expect(mainDiv.className).toContain('aurora-container');

        // Animated blobs use the `aurora-blob` class
        const blobs = mainDiv.querySelectorAll('.aurora-blob');
        expect(blobs.length).toBeGreaterThan(0);

        // The blobs carry their color/size utility classes
        const firstBlob = blobs[0] as HTMLElement;
        expect(firstBlob.className).toContain('aurora-blob');
    });
});
