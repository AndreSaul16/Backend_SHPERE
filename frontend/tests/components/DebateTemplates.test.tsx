import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DebateTemplates } from '../../src/components/chat/DebateTemplates';
import { DEBATE_TEMPLATES } from '../../src/lib/debateTemplates';

describe('DebateTemplates (F7)', () => {
    it('renderiza las 6 plantillas de debate', () => {
        render(<DebateTemplates onPick={() => {}} />);
        expect(DEBATE_TEMPLATES).toHaveLength(6);
        for (const tpl of DEBATE_TEMPLATES) {
            expect(screen.getByText(tpl.title)).toBeInTheDocument();
        }
    });

    it('al hacer click llama onPick con el prompt (rellena el input, no envía)', () => {
        const onPick = vi.fn();
        render(<DebateTemplates onPick={onPick} />);
        fireEvent.click(screen.getByText('Estrategia de precios'));
        expect(onPick).toHaveBeenCalledTimes(1);
        expect(onPick).toHaveBeenCalledWith(DEBATE_TEMPLATES[0].prompt);
        // El prompt tiene huecos entre corchetes.
        expect(onPick.mock.calls[0][0]).toMatch(/\[.+\]/);
    });
});
