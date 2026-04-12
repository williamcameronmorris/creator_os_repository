import { Lightbulb, FileText, Video, Calendar, MessageCircle, BarChart3, CheckCircle2 } from 'lucide-react';

export type WorkflowStage = 'ideation' | 'scripting' | 'creation' | 'scheduling' | 'engagement' | 'analysis';

interface WorkflowStepperProps {
  currentStage: WorkflowStage;
  onStageSelect: (stage: WorkflowStage) => void;
  completedStages: WorkflowStage[];
}

export function WorkflowStepper({ currentStage, onStageSelect, completedStages }: WorkflowStepperProps) {
  const stages: { id: WorkflowStage; label: string; icon: any }[] = [
    { id: 'ideation', label: 'Ideation', icon: Lightbulb },
    { id: 'scripting', label: 'Scripting', icon: FileText },
    { id: 'creation', label: 'Creation', icon: Video },
    { id: 'scheduling', label: 'Scheduling', icon: Calendar },
    { id: 'engagement', label: 'Engagement', icon: MessageCircle },
    { id: 'analysis', label: 'Analysis', icon: BarChart3 },
  ];

  return (
    <div className="w-full bg-card border-b border-border sticky top-0 z-10">
      <div className="max-w-6xl mx-auto px-2 sm:px-4">
        <div className="flex items-center py-3 sm:py-4 overflow-x-auto scrollbar-hide gap-2">
          {stages.map((stage, index) => {
            const Icon = stage.icon;
            const isActive = currentStage === stage.id;
            const isCompleted = completedStages.includes(stage.id);

            return (
              <div key={stage.id} className="flex items-center flex-shrink-0">
                <button
                  onClick={() => onStageSelect(stage.id)}
                  className="flex flex-col items-center gap-1.5 sm:gap-2 group cursor-pointer px-2"
                >
                  <div className="relative">
                    <div className={`w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center transition-all duration-300 border ${
                      isActive
                        ? 'bg-foreground text-background border-foreground'
                        : isCompleted
                        ? 'text-foreground border-foreground'
                        : 'text-muted-foreground border-border hover:border-foreground'
                    }`}>
                      {isCompleted && !isActive ? (
                        <CheckCircle2 className="w-5 h-5 sm:w-6 sm:h-6" />
                      ) : (
                        <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
                      )}
                    </div>

                    {index < stages.length - 1 && (
                      <div className={`absolute top-1/2 left-full h-0.5 -translate-y-1/2 ${
                        completedStages.includes(stages[index + 1].id) || currentStage === stages[index + 1].id
                          ? 'bg-foreground'
                          : 'bg-border'
                      }`} style={{ width: '1.5rem' }} />
                    )}
                  </div>

                  <span className={`font-mono text-[10px] font-bold tracking-[0.08em] uppercase whitespace-nowrap truncate max-w-[70px] sm:max-w-none ${
                    isActive ? 'text-foreground' : isCompleted ? 'text-foreground' : 'text-muted-foreground'
                  }`}>
                    {stage.label}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
