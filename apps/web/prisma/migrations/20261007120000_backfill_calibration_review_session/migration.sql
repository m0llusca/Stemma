-- Attach a calibration review to a session only when exactly one session
-- matches workspace, scorecard, conversation item, and reviewer participant.
-- Ambiguous and unmatched rows stay NULL so the calibration page can count them.
UPDATE "Review" AS review
SET "calibrationSessionId" = matched.session_id
FROM (
  SELECT review.id AS review_id, MIN(session.id) AS session_id
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
  GROUP BY review.id
  HAVING COUNT(DISTINCT session.id) = 1
) AS matched
WHERE review.id = matched.review_id;
