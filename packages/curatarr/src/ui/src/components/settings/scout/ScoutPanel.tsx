import type { ScoutPanelProps } from '../types';
import { Automation } from './sections/Automation';
import { CfScoring } from './sections/CfScoring';
import { CustomOverrides } from './sections/CustomOverrides';
import { ExtendedLlmRuleset } from './sections/ExtendedLlmRuleset';
import { LlmProvider } from './sections/LlmProvider';
import { MinimumQualifiers } from './sections/MinimumQualifiers';
import { Prowlarr } from './sections/Prowlarr';
import { Rules } from './sections/Rules';
import { TrashBaseline } from './sections/TrashBaseline';
import { TrashSyncDetails } from './sections/TrashSyncDetails';

export function ScoutPanel(props: ScoutPanelProps) {
  return (
    <>
      <Prowlarr {...props.prowlarr} />
      <LlmProvider {...props.llmProvider} />
      <MinimumQualifiers {...props.minimumQualifiers} />
      <CfScoring {...props.cfScoring} />
      <TrashSyncDetails {...props.trashSyncDetails} />
      <TrashBaseline {...props.trashBaseline} />
      <CustomOverrides {...props.customOverrides} />
      <Rules {...props.rules} />
      <ExtendedLlmRuleset {...props.extendedLlmRuleset} />
      <Automation {...props.automation} />
    </>
  );
}
