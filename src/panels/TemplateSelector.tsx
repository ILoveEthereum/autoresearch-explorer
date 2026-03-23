import { WizardShell } from './wizard/WizardShell';

interface Props {
  onClose: () => void;
}

export function TemplateSelector({ onClose }: Props) {
  return <WizardShell onClose={onClose} />;
}
