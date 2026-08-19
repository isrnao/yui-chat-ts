import { useState } from 'react';
import { createConversationMeasurement } from '@features/chat/utils/conversationMeasurement';

export function useConversationMeasurement() {
  const [measurement] = useState(createConversationMeasurement);
  return measurement;
}
