import React, { useState, useEffect, useCallback, useRef } from "react";
import { X, ChevronLeft, ChevronRight, CheckCircle, ClipboardList, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  useListQuestionnaireThemes,
  useGetUnitQuestionnaireResponses,
  useSaveUnitQuestionnaireResponses,
  useSubmitUnitQuestionnaire,
  getGetUnitQuestionnaireResponsesQueryKey,
  getGetUnitComplianceTagsQueryKey,
  getListQuestionnaireThemesQueryKey,
  type QuestionnaireTheme,
  type QuestionnaireQuestion,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

interface QuestionnaireModalProps {
  isOpen: boolean;
  onClose: () => void;
  orgId: number;
  unitId: number;
  unitName: string;
}

export function QuestionnaireModal({ isOpen, onClose, orgId, unitId, unitName }: QuestionnaireModalProps) {
  const queryClient = useQueryClient();
  const [activeThemeIndex, setActiveThemeIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [submitted, setSubmitted] = useState(false);
  const [submittedTags, setSubmittedTags] = useState<string[]>([]);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: themes, isLoading: themesLoading } = useListQuestionnaireThemes(orgId, {
    query: {
      queryKey: getListQuestionnaireThemesQueryKey(orgId),
      enabled: !!orgId && isOpen,
    },
  });

  const { data: savedResponses, isLoading: responsesLoading } = useGetUnitQuestionnaireResponses(orgId, unitId, {
    query: {
      queryKey: getGetUnitQuestionnaireResponsesQueryKey(orgId, unitId),
      enabled: !!orgId && !!unitId && isOpen,
    },
  });

  const saveMut = useSaveUnitQuestionnaireResponses();
  const submitMut = useSubmitUnitQuestionnaire();

  useEffect(() => {
    if (savedResponses) {
      setAnswers(Object.keys(savedResponses).length > 0 ? savedResponses : {});
    }
  }, [savedResponses]);

  const flushSave = useCallback((currentAnswers: Record<string, string | string[]>) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    saveMut.mutate({ orgId, unitId, data: { answers: currentAnswers } });
  }, [orgId, unitId, saveMut]);

  const autoSave = useCallback((currentAnswers: Record<string, string | string[]>) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      saveMut.mutate({ orgId, unitId, data: { answers: currentAnswers } });
    }, 1500);
  }, [orgId, unitId, saveMut]);

  const updateAnswer = useCallback((questionCode: string, value: string | string[]) => {
    setAnswers(prev => {
      const updated = { ...prev, [questionCode]: value };
      autoSave(updated);
      return updated;
    });
  }, [autoSave]);

  const toggleMultiSelect = useCallback((questionCode: string, option: string) => {
    setAnswers(prev => {
      const current = (prev[questionCode] as string[]) || [];
      const isNa = option.toLowerCase().includes("não se aplica") || option.toLowerCase() === "nenhuma das anteriores";

      let updated: string[];
      if (isNa) {
        updated = current.includes(option) ? [] : [option];
      } else {
        const naOptions = (themes?.flatMap(t => t.questions) || [])
          .find(q => q.code === questionCode)
          ?.options?.filter(o => o.toLowerCase().includes("não se aplica") || o.toLowerCase() === "nenhuma das anteriores") || [];
        const withoutNa = current.filter(c => !naOptions.includes(c));
        updated = withoutNa.includes(option)
          ? withoutNa.filter(c => c !== option)
          : [...withoutNa, option];
      }

      const newAnswers = { ...prev, [questionCode]: updated };
      autoSave(newAnswers);
      return newAnswers;
    });
  }, [autoSave, themes]);

  const handleSubmit = async () => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    await saveMut.mutateAsync({ orgId, unitId, data: { answers } });
    const result = await submitMut.mutateAsync({ orgId, unitId });
    setSubmittedTags(result.tags);
    setSubmitted(true);
    queryClient.invalidateQueries({ queryKey: getGetUnitComplianceTagsQueryKey(orgId, unitId) });
  };

  const handleClose = () => {
    if (saveTimeoutRef.current) {
      flushSave(answers);
    }
    setActiveThemeIndex(0);
    setSubmitted(false);
    setSubmittedTags([]);
    onClose();
  };

  const changeTheme = (index: number) => {
    if (saveTimeoutRef.current) {
      flushSave(answers);
    }
    setActiveThemeIndex(index);
  };

  const isQuestionVisible = (question: QuestionnaireQuestion): boolean => {
    if (!question.conditionalOn) return true;
    const parentAnswer = answers[question.conditionalOn];
    if (!parentAnswer) return false;
    if (Array.isArray(parentAnswer)) return parentAnswer.includes(question.conditionalValue || "");
    return parentAnswer === question.conditionalValue;
  };

  const getThemeCompletion = (theme: QuestionnaireTheme): number => {
    const visibleQuestions = theme.questions.filter(isQuestionVisible);
    if (visibleQuestions.length === 0) return 100;
    const answered = visibleQuestions.filter(q => {
      const ans = answers[q.code];
      if (!ans) return false;
      if (Array.isArray(ans)) return ans.length > 0;
      return ans !== "";
    }).length;
    return Math.round((answered / visibleQuestions.length) * 100);
  };

  if (!isOpen) return null;

  const activeTheme = themes?.[activeThemeIndex];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-[960px] max-w-[95vw] max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/60">
          <div className="flex items-center gap-3">
            <ClipboardList className="w-5 h-5 text-primary" />
            <div>
              <h2 className="text-base font-semibold text-foreground">Questionário de Compliance</h2>
              <p className="text-[12px] text-muted-foreground mt-0.5">{unitName}</p>
            </div>
          </div>
          <button onClick={handleClose} className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {themesLoading || responsesLoading ? (
          <div className="flex-1 flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : submitted ? (
          <div className="flex-1 flex flex-col items-center justify-center py-16 px-8">
            <CheckCircle className="w-12 h-12 text-emerald-500 mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">Questionário Enviado</h3>
            <p className="text-[13px] text-muted-foreground mb-6 text-center max-w-md">
              As respostas foram processadas e {submittedTags.length} tag{submittedTags.length !== 1 ? 's' : ''} de compliance {submittedTags.length !== 1 ? 'foram geradas' : 'foi gerada'} para esta unidade.
            </p>
            {submittedTags.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-8 max-w-lg justify-center">
                {submittedTags.slice(0, 20).map(tag => (
                  <span key={tag} className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-primary/10 text-primary border border-primary/20">
                    {tag.replace(/_/g, ' ')}
                  </span>
                ))}
                {submittedTags.length > 20 && (
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-secondary text-muted-foreground">
                    +{submittedTags.length - 20} mais
                  </span>
                )}
              </div>
            )}
            <Button onClick={handleClose}>Fechar</Button>
          </div>
        ) : (
          <div className="flex-1 flex min-h-0">
            <div className="w-56 border-r border-border/60 bg-secondary/20 overflow-y-auto py-3 flex-shrink-0">
              {themes?.map((theme, index) => {
                const completion = getThemeCompletion(theme);
                const isActive = index === activeThemeIndex;
                return (
                  <button
                    key={theme.id}
                    onClick={() => changeTheme(index)}
                    className={`w-full text-left px-4 py-3 transition-colors cursor-pointer ${
                      isActive
                        ? "bg-white border-r-2 border-primary"
                        : "hover:bg-white/60"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-[13px] ${isActive ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                        {theme.name}
                      </span>
                      <span className={`text-[11px] font-medium ${
                        completion === 100 ? "text-emerald-600" : completion > 0 ? "text-amber-600" : "text-muted-foreground/60"
                      }`}>
                        {completion}%
                      </span>
                    </div>
                    <div className="mt-1.5 h-1 rounded-full bg-border/60 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          completion === 100 ? "bg-emerald-500" : completion > 0 ? "bg-amber-500" : "bg-transparent"
                        }`}
                        style={{ width: `${completion}%` }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex-1 overflow-y-auto px-8 py-6">
                {activeTheme && (
                  <div className="space-y-8">
                    <div>
                      <h3 className="text-base font-semibold text-foreground">{activeTheme.name}</h3>
                      {activeTheme.description && (
                        <p className="text-[13px] text-muted-foreground mt-1">{activeTheme.description}</p>
                      )}
                    </div>

                    {activeTheme.questions.filter(isQuestionVisible).map((question) => (
                      <QuestionRenderer
                        key={question.id}
                        question={question}
                        answer={answers[question.code]}
                        onAnswer={updateAnswer}
                        onToggleMulti={toggleMultiSelect}
                      />
                    ))}
                  </div>
                )}
              </div>

              <div className="flex-shrink-0 border-t border-border/60 px-8 py-4 flex items-center justify-between bg-white">
                <Button
                  variant="ghost"
                  onClick={() => changeTheme(Math.max(0, activeThemeIndex - 1))}
                  disabled={activeThemeIndex === 0}
                >
                  <ChevronLeft className="w-4 h-4 mr-1" /> Tema anterior
                </Button>

                <div className="flex items-center gap-3">
                  {saveMut.isPending && (
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin" /> Salvando...
                    </span>
                  )}
                  {activeThemeIndex === (themes?.length || 1) - 1 ? (
                    <Button onClick={handleSubmit} isLoading={submitMut.isPending}>
                      Enviar questionário
                    </Button>
                  ) : (
                    <Button
                      onClick={() => changeTheme(Math.min((themes?.length || 1) - 1, activeThemeIndex + 1))}
                    >
                      Próximo tema <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function QuestionRenderer({
  question,
  answer,
  onAnswer,
  onToggleMulti,
}: {
  question: QuestionnaireQuestion;
  answer: string | string[] | undefined;
  onAnswer: (code: string, value: string | string[]) => void;
  onToggleMulti: (code: string, option: string) => void;
}) {
  if (question.type === "text") {
    return (
      <div>
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-2">
          {question.questionNumber}) {question.text}
        </label>
        <Textarea
          value={(answer as string) || ""}
          onChange={(e) => onAnswer(question.code, e.target.value)}
          placeholder="Digite sua resposta..."
          rows={3}
          className="text-[13px]"
        />
      </div>
    );
  }

  if (question.type === "multi_select") {
    const selected = (answer as string[]) || [];
    return (
      <div>
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-3">
          {question.questionNumber}) {question.text}
        </label>
        <div className="space-y-2">
          {question.options?.map((option) => {
            const isChecked = selected.includes(option);
            return (
              <button
                key={option}
                onClick={() => onToggleMulti(question.code, option)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg border transition-all text-left cursor-pointer ${
                  isChecked
                    ? "border-primary bg-primary/5 text-foreground"
                    : "border-border/60 hover:border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                <div className={`w-4 h-4 rounded flex-shrink-0 border-2 flex items-center justify-center transition-colors ${
                  isChecked ? "border-primary bg-primary" : "border-border"
                }`}>
                  {isChecked && (
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                      <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                <span className="text-[13px]">{option}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div>
      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-3">
        {question.questionNumber}) {question.text}
      </label>
      <div className="space-y-2">
        {question.options?.map((option) => {
          const isSelected = answer === option;
          return (
            <button
              key={option}
              onClick={() => onAnswer(question.code, option)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg border transition-all text-left cursor-pointer ${
                isSelected
                  ? "border-primary bg-primary/5 text-foreground"
                  : "border-border/60 hover:border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              <div className={`w-4 h-4 rounded-full flex-shrink-0 border-2 flex items-center justify-center transition-colors ${
                isSelected ? "border-primary" : "border-border"
              }`}>
                {isSelected && <div className="w-2 h-2 rounded-full bg-primary" />}
              </div>
              <span className="text-[13px]">{option}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
