-- Attach a calibration review to a session only when exactly one session
-- matches workspace, scorecard, conversation item, and reviewer participant.
-- Keep duplicates and already-occupied slots NULL; never guess which grade wins.
-- Serialize against live writes for the unique session/conversation/reviewer slot.
BEGIN;
LOCK TABLE "Review" IN SHARE ROW EXCLUSIVE MODE;

WITH matched AS (
  SELECT review.id AS review_id, review."conversationId" AS conversation_id,
         review."reviewerId" AS reviewer_id, MIN(session.id) AS session_id
  FROM "Review" AS review
  JOIN "CalibrationSession" AS session
    ON session."workspaceId" = review."workspaceId"
   AND session."scorecardId" = review."scorecardId"
  JOIN "CalibrationSessionItem" AS item
    ON item."sessionId" = session.id
   AND item."conversationId" = review."conversationId"
  JOIN "CalibrationParticipant" AS participant
    ON participant."sessionId" = session.id
   AND participant."userId" = review."reviewerId"
  WHERE review."reviewSource" = 'CALIBRATION'
    AND review."calibrationSessionId" IS NULL
  GROUP BY review.id, review."conversationId", review."reviewerId"
  HAVING COUNT(DISTINCT session.id) = 1
), unique_slots AS (
  SELECT session_id, conversation_id, reviewer_id
  FROM matched
  GROUP BY session_id, conversation_id, reviewer_id
  HAVING COUNT(*) = 1
)
UPDATE "Review" AS review
SET "calibrationSessionId" = matched.session_id
FROM matched
JOIN unique_slots USING (session_id, conversation_id, reviewer_id)
WHERE review.id = matched.review_id
  AND NOT EXISTS (
    SELECT 1 FROM "Review" AS existing
    WHERE existing."calibrationSessionId" = matched.session_id
      AND existing."conversationId" = matched.conversation_id
      AND existing."reviewerId" = matched.reviewer_id
  );

COMMIT;
