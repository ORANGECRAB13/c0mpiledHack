import React, { createContext, useContext } from 'react';

const AssistantContext = createContext(null);

export function AssistantProvider({ value, children }) {
  return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>;
}

export function useProductAssistant() {
  const value = useContext(AssistantContext);
  if (!value) throw new Error('useProductAssistant must be used inside AssistantProvider');
  return value;
}
