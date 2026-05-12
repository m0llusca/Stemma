DO $$
DECLARE
    target_workspace_id TEXT;
BEGIN
    SELECT w."id"
    INTO target_workspace_id
    FROM "Workspace" w
    WHERE NOT EXISTS (
        SELECT 1
        FROM "IdentityProvider" ip
        WHERE ip."workspaceId" = w."id"
          AND ip."type" = 'DEMO'
    )
    ORDER BY w."createdAt" ASC
    LIMIT 1;

    IF target_workspace_id IS NULL THEN
        target_workspace_id := 'workspace_primary_' || substr(md5(clock_timestamp()::text || random()::text), 1, 16);

        INSERT INTO "Workspace" ("id", "name", "createdAt", "updatedAt")
        VALUES (target_workspace_id, 'Контроль качества', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
    END IF;

    UPDATE "User" u
    SET "workspaceId" = target_workspace_id,
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE EXISTS (
        SELECT 1
        FROM "LocalCredential" lc
        WHERE lc."userId" = u."id"
    )
      AND EXISTS (
        SELECT 1
        FROM "IdentityProvider" ip
        WHERE ip."workspaceId" = u."workspaceId"
          AND ip."type" = 'DEMO'
    )
      AND NOT EXISTS (
        SELECT 1
        FROM "ExternalIdentity" ei
        JOIN "IdentityProvider" eip ON eip."id" = ei."providerId"
        WHERE ei."userId" = u."id"
          AND eip."type" = 'DEMO'
    )
      AND NOT EXISTS (
        SELECT 1
        FROM "User" existing_user
        WHERE existing_user."workspaceId" = target_workspace_id
          AND existing_user."email" = u."email"
          AND existing_user."id" <> u."id"
    )
      AND NOT EXISTS (
        SELECT 1
        FROM "LocalCredential" lc
        JOIN "LocalCredential" existing_credential ON existing_credential."login" = lc."login"
        WHERE lc."userId" = u."id"
          AND existing_credential."workspaceId" = target_workspace_id
          AND existing_credential."userId" <> u."id"
    );

    UPDATE "LocalCredential" lc
    SET "workspaceId" = target_workspace_id,
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE lc."workspaceId" <> target_workspace_id
      AND EXISTS (
        SELECT 1
        FROM "User" u
        WHERE u."id" = lc."userId"
          AND u."workspaceId" = target_workspace_id
    );

    UPDATE "AuthSession" session
    SET "workspaceId" = target_workspace_id
    WHERE session."workspaceId" <> target_workspace_id
      AND EXISTS (
        SELECT 1
        FROM "User" u
        WHERE u."id" = session."userId"
          AND u."workspaceId" = target_workspace_id
    );
END $$;
