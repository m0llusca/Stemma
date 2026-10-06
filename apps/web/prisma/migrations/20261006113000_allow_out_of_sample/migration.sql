ALTER TABLE "Conversation" DROP CONSTRAINT "Conversation_samplingType_chk";
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_samplingType_chk"
  CHECK ("samplingType" IN ('RANDOM', 'DSAT', 'LEAD_SIGNAL', 'NEW_HIRE', 'LOW_SCORE', 'MANUAL', 'OUT_OF_SAMPLE'));
