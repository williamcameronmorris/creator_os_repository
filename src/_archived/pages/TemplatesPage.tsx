import { useState } from 'react';
import { DealTemplates } from '../components/DealTemplates';
import { DealIntake } from '../components/DealIntake';
import { type DealTemplate } from '../lib/supabase';

export function TemplatesPage() {
  const [selectedTemplate, setSelectedTemplate] = useState<DealTemplate | undefined>();
  const [showIntake, setShowIntake] = useState(false);

  const handleSelectTemplate = (template: DealTemplate) => {
    setSelectedTemplate(template);
    setShowIntake(true);
  };

  const handleSave = () => {
    setShowIntake(false);
    setSelectedTemplate(undefined);
  };

  if (showIntake) {
    return <DealIntake template={selectedTemplate} onSave={handleSave} />;
  }

  return <DealTemplates onSelectTemplate={handleSelectTemplate} />;
}
