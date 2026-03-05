import type { ScoutPanelProps } from '../types';
import { Automation } from './sections/Automation';
import { CfScoring } from './sections/CfScoring';
import { CustomOverrides } from './sections/CustomOverrides';
import { ExtendedLlmRuleset } from './sections/ExtendedLlmRuleset';
import { LlmProvider } from './sections/LlmProvider';
import { Prowlarr } from './sections/Prowlarr';
import { TrashBaseline } from './sections/TrashBaseline';
import { TrashSyncDetails } from './sections/TrashSyncDetails';

export function ScoutPanel(props: ScoutPanelProps) {
  return (
    <>
      <Prowlarr {...props.prowlarr} />
      <LlmProvider {...props.llmProvider} />
      <CfScoring {...props.cfScoring} />
      <CustomOverrides {...props.customOverrides} />
      <ExtendedLlmRuleset {...props.extendedLlmRuleset} />
      <Automation {...props.automation} />
      <details className="rounded-lg border p-3" style={{ borderColor: 'var(--c-border)', background: 'var(--c-bg)' }}>
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider" style={{ color: '#8b87aa' }}>
          Advanced TRaSH Sync & Baseline
        </summary>
        <div className="mt-3 space-y-3">
          <TrashSyncDetails {...props.trashSyncDetails} />
          <TrashBaseline {...props.trashBaseline} />
        </div>
      </details>
    </>
  );
}
