"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSettings, useUpdateSettings } from '@/lib/api/hooks/useSettings';
import type { Settings } from '@/lib/api/types';

interface WizardState {
  isActive: boolean;
  minimized: boolean;
  currentStep: number;
  completedSteps: number;
  stepData: Record<string, unknown>;
}

interface SetupWizardContextType {
  isWizardActive: boolean;
  /** True when there is a pending setup session that the user has temporarily hidden. */
  isWizardMinimized: boolean;
  currentStep: number;
  totalSteps: number;
  isLoading: boolean;
  nextStep: () => Promise<void>;
  previousStep: () => void;
  completeWizard: () => Promise<void>;
  /** Hide the wizard without completing it (e.g. while a long import runs in the background). */
  minimizeWizard: () => void;
  /** Re-open a minimized wizard so the user can finish the remaining steps. */
  reopenWizard: () => void;
  setStepData: (stepIndex: number, data: unknown) => void;
  getStepData: (stepIndex: number) => unknown;
}

const WIZARD_STORAGE_KEY = 'setup-wizard-state';
const TOTAL_STEPS = 7;

const SetupWizardContext = createContext<SetupWizardContextType | undefined>(undefined);

export function SetupWizardProvider({ children }: { children: React.ReactNode }) {
  const { data: settings, isLoading: settingsLoading } = useSettings();
  const { mutate: saveSettings } = useUpdateSettings();
  const queryClient = useQueryClient();
  
  const [wizardState, setWizardState] = useState<WizardState>({
    isActive: false,
    minimized: false,
    currentStep: 0,
    completedSteps: 0,
    stepData: {},
  });
  
  const [isClient, setIsClient] = useState(false);

  // Initialize client-side state after hydration
  useEffect(() => {
    setIsClient(true);
    const saved = localStorage.getItem(WIZARD_STORAGE_KEY);
    if (saved) {
      try {
        const parsedState = JSON.parse(saved) as WizardState;
        setWizardState(parsedState);
      } catch {
        // If parsing fails, keep default state
      }
    }
  }, []);
  // Initialize wizard state based on settings
  useEffect(() => {
    if (settings && !settingsLoading && isClient) {
      const shouldShowWizard = !settings.isWizardSetupComplete;
      const currentStep = Math.min(settings.wizardSetupStepCompleted, TOTAL_STEPS - 1);
      
      // Only update if this is different from current state to avoid overwriting localStorage unnecessarily
      setWizardState(prev => {
        const needsUpdate = prev.isActive !== shouldShowWizard || 
                           prev.currentStep !== currentStep || 
                           prev.completedSteps !== currentStep;
        
        if (needsUpdate) {
          return {
            ...prev,
            isActive: shouldShowWizard,
            currentStep,
            completedSteps: currentStep,
          };
        }
        return prev;
      });
    }
  }, [settings, settingsLoading, isClient]);

  // Save state to localStorage whenever it changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify(wizardState));
    }
  }, [wizardState]);  const nextStep = async () => {
    if (wizardState.currentStep < TOTAL_STEPS - 1) {
      const currentStepIndex = wizardState.currentStep;
      const nextStepIndex = currentStepIndex + 1;
      
      // Update local state first to ensure wizard progresses
      setWizardState(prev => ({
        ...prev,
        currentStep: nextStepIndex,
        completedSteps: Math.max(prev.completedSteps, nextStepIndex),
      }));
      
      // Update backend settings (but don't block wizard progression on this)
      if (settings) {
        let updatedSettings: Settings = {
          ...settings,
          wizardSetupStepCompleted: nextStepIndex,
        };

        // If we're moving from step 0 (preferences), merge the preferences data
        if (currentStepIndex === 0) {
          const preferencesData = wizardState.stepData[0] as Settings | undefined;
          if (preferencesData) {
            updatedSettings = {
              ...updatedSettings,
              ...preferencesData,
            };
            updatedSettings.wizardSetupStepCompleted = nextStepIndex;
          }
        }        saveSettings(updatedSettings, {
          onSuccess: () => {},
          onError: (error) => {
            console.error('Failed to save wizard progress:', error);
            // Don't revert wizard state - let user continue
          },
        });
      } else {
        console.warn('No settings available to save wizard progress');
      }
    }
  };  const previousStep = () => {
    if (wizardState.currentStep > 0) {
      const prevStepIndex = wizardState.currentStep - 1;
      
      // Update local state first to ensure wizard navigation works
      setWizardState(prev => ({
        ...prev,
        currentStep: prevStepIndex,
      }));
      
      // Update backend settings (but don't block wizard navigation)
      if (settings) {
        const updatedSettings: Settings = {
          ...settings,
          wizardSetupStepCompleted: prevStepIndex,
        };
          saveSettings(updatedSettings, {
          onSuccess: () => {},
          onError: (error) => {
            console.error('Failed to save wizard progress when going back:', error);
            // Don't revert wizard state - let user continue
          },
        });
      }
    }
  };  const completeWizard = async () => {
    if (settings) {
      let updatedSettings: Settings = {
        ...settings,
      };

      // Merge any preferences data from step 0 if available
      const preferencesData = wizardState.stepData[0] as Settings | undefined;
      if (preferencesData) {
        updatedSettings = {
          ...updatedSettings,
          ...preferencesData,
        };
      }

      // Ensure completion flags are set last and cannot be overridden
      updatedSettings.isWizardSetupComplete = true;
      updatedSettings.wizardSetupStepCompleted = 0;
        saveSettings(updatedSettings, {
        onSuccess: () => {
          setWizardState(prev => ({
            ...prev,
            isActive: false,
            minimized: false,
            currentStep: 0,
            completedSteps: 0,
            stepData: {},
          }));
          
          // Clear localStorage
          if (typeof window !== 'undefined') {
            localStorage.removeItem(WIZARD_STORAGE_KEY);
          }
          
          // Invalidate library query to refresh the library
          void queryClient.invalidateQueries({ queryKey: ['series', 'library'] });},
        onError: (error) => {
          console.error('Failed to complete wizard setup:', error);
          // Still close the wizard even if backend update fails
          setWizardState(prev => ({
            ...prev,
            isActive: false,
            minimized: false,
            currentStep: 0,
            completedSteps: 0,
            stepData: {},
          }));
          
          // Clear localStorage
          if (typeof window !== 'undefined') {
            localStorage.removeItem(WIZARD_STORAGE_KEY);
          }
        },
      });
    }
  };
  const setStepData = (stepIndex: number, data: unknown) => {
    setWizardState(prev => ({
      ...prev,
      stepData: {
        ...prev.stepData,
        [stepIndex]: data,
      },
    }));
  };
  const getStepData = (stepIndex: number): unknown => {
    return wizardState.stepData[stepIndex];
  };
  // First-time setup is mandatory and cannot be minimized or dismissed, so these are no-ops.
  // They're kept only for interface compatibility with existing consumers.
  const minimizeWizard = () => {};
  const reopenWizard = () => {};
  const contextValue: SetupWizardContextType = {
    // The wizard is modal and non-dismissable during first-time setup: it's shown whenever
    // there is an active (incomplete) setup session and can never be minimized/hidden. A stale
    // `minimized: true` left in localStorage by an older build is deliberately ignored here so
    // the wizard always reappears until setup is actually completed (no limbo state).
    isWizardActive: wizardState.isActive,
    isWizardMinimized: false,
    currentStep: wizardState.currentStep,
    totalSteps: TOTAL_STEPS,
    isLoading: settingsLoading,
    nextStep,
    previousStep,
    completeWizard,
    minimizeWizard,
    reopenWizard,
    setStepData,
    getStepData,
  };

  // Always provide the context, but with safe default values during SSR
  return (
    <SetupWizardContext.Provider value={contextValue}>
      {children}
    </SetupWizardContext.Provider>
  );
}

export function useSetupWizard() {
  const context = useContext(SetupWizardContext);
  if (context === undefined) {
    throw new Error('useSetupWizard must be used within a SetupWizardProvider');
  }
  return context;
}
