import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveIdentityPolicyForUser: vi.fn(),
  resolveIdentityPolicyFromExternalClaims: vi.fn()
}));

vi.mock("@/lib/auth/providers", () => ({
  resolveIdentityPolicyForUser: mocks.resolveIdentityPolicyForUser,
  resolveIdentityPolicyFromExternalClaims: mocks.resolveIdentityPolicyFromExternalClaims
}));

describe("directory sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveIdentityPolicyForUser.mockResolvedValue({
      role: "QA_ANALYST",
      roleSource: "group_mapping"
    });
    mocks.resolveIdentityPolicyFromExternalClaims.mockResolvedValue({
      role: "QA_ANALYST",
      roleSource: "group_mapping"
    });
  });

  it("updates user lastDirectorySyncAt after a successful sync even when attributes are unchanged", async () => {
    const client = {
      identityProvider: {
        findFirst: vi.fn().mockResolvedValue({
          id: "provider-1",
          workspaceId: "workspace-1",
          type: "MICROSOFT_ENTRA_ID",
          status: "active"
        }),
        update: vi.fn().mockResolvedValue({})
      },
      externalIdentity: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "identity-1",
            userId: "user-1",
            providerId: "provider-1",
            email: "qa@example.com",
            displayName: "QA User",
            rawClaimsJson: JSON.stringify({ groups: ["QC_Analysts"] }),
            user: {
              id: "user-1",
              email: "qa@example.com",
              name: "QA User",
              role: "QA_ANALYST",
              supportLine: null,
              teamName: null,
              sourceOfTruthProviderId: "provider-1"
            }
          }
        ]),
        update: vi.fn().mockResolvedValue({})
      },
      user: {
        update: vi.fn().mockResolvedValue({})
      }
    };
    const { syncDirectoryProvider } = await import("@/lib/auth/directory-sync");

    await expect(
      syncDirectoryProvider({
        workspaceId: "workspace-1",
        providerId: "provider-1",
        client: client as never
      })
    ).resolves.toMatchObject({
      identities: 1,
      updatedUsers: 0
    });

    expect(client.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: {
        lastDirectorySyncAt: expect.any(Date)
      }
    });
    expect(mocks.resolveIdentityPolicyForUser).toHaveBeenCalledWith(
      "workspace-1",
      "provider-1",
      "user-1",
      {
        appRoles: [],
        groups: ["QC_Analysts"],
        supportLine: null,
        teamName: null,
        attributes: { groups: ["QC_Analysts"] }
      }
    );
  });

  it("runs Active Directory LDAPS dry-run with paged search, nested group diagnostics, and no user writes", async () => {
    process.env.TEST_AD_BIND_PASSWORD = "bind-secret";
    const searchPaginated = vi.fn(async function* (base: string, options: { filter?: string }) {
      if (base === "OU=Groups,DC=example,DC=com" && String(options.filter).includes("1.2.840.113556.1.4.1941")) {
        yield {
          searchEntries: [
            {
              dn: "CN=Nested QA,OU=Groups,DC=example,DC=com",
              cn: "Nested QA"
            }
          ],
          searchReferences: []
        };
        return;
      }

      if (base === "OU=Groups,DC=example,DC=com") {
        yield {
          searchEntries: [
            {
              dn: "CN=Nested QA,OU=Groups,DC=example,DC=com",
              cn: "Nested QA"
            }
          ],
          searchReferences: []
        };
        return;
      }

      yield {
        searchEntries: [
          {
            dn: "CN=QA User,OU=Users,DC=example,DC=com",
            objectGUID: Buffer.from("user-guid"),
            mail: "qa@example.com",
            displayName: "QA User",
            userAccountControl: "512",
            memberOf: ["CN=Nested QA,OU=Groups,DC=example,DC=com"]
          }
        ],
        searchReferences: []
      };
    });
    const ldapClient = {
      bind: vi.fn().mockResolvedValue(undefined),
      search: vi.fn(),
      searchPaginated,
      unbind: vi.fn().mockResolvedValue(undefined)
    };
    const client = {
      identityProvider: {
        findFirst: vi.fn().mockResolvedValue({
          id: "provider-1",
          workspaceId: "workspace-1",
          type: "ACTIVE_DIRECTORY_LDAPS",
          status: "draft",
          ldapsUrl: "ldaps://dc01.example.com:636",
          ldapsBindDn: "CN=svc,DC=example,DC=com",
          ldapsBindSecretRef: "env:TEST_AD_BIND_PASSWORD",
          configJson: JSON.stringify({
            userSearchBase: "OU=Users,DC=example,DC=com",
            groupSearchBase: "OU=Groups,DC=example,DC=com",
            nestedGroups: true,
            pageSize: 250
          })
        }),
        update: vi.fn().mockResolvedValue({})
      },
      externalIdentity: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn()
      },
      identityGroup: {
        upsert: vi.fn()
      },
      userIdentityGroup: {
        deleteMany: vi.fn(),
        upsert: vi.fn(),
        findMany: vi.fn()
      },
      user: {
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn()
      },
      groupRoleMapping: {
        findMany: vi.fn()
      },
      authSession: {
        updateMany: vi.fn()
      },
      auditLog: {
        create: vi.fn()
      }
    };
    const { syncDirectoryProvider } = await import("@/lib/auth/directory-sync");

    await expect(
      syncDirectoryProvider({
        workspaceId: "workspace-1",
        providerId: "provider-1",
        dryRun: true,
        client: client as never,
        ldapClientFactory: vi.fn(() => ldapClient)
      })
    ).resolves.toMatchObject({
      providerId: "provider-1",
      dryRun: true,
      scannedUsers: 1,
      scannedGroups: 1,
      activeUsers: 1,
      createdUsers: 0,
      diagnostics: {
        protocol: "ldaps",
        nestedGroupMatchingRule: "1.2.840.113556.1.4.1941",
        pageSize: 250,
        binaryAttributes: ["objectGUID"],
        searchReferencesSkipped: 0,
        skippedUnknownGroupMemberships: 0
      }
    });

    expect(ldapClient.bind).toHaveBeenCalledWith("CN=svc,DC=example,DC=com", "bind-secret");
    expect(searchPaginated).toHaveBeenCalledWith(
      "OU=Users,DC=example,DC=com",
      expect.objectContaining({
        explicitBufferAttributes: ["objectGUID"],
        paged: { pageSize: 250 }
      })
    );
    expect(String(searchPaginated.mock.calls[2][1].filter)).toContain("1.2.840.113556.1.4.1941");
    expect(client.user.create).not.toHaveBeenCalled();
    expect(client.identityGroup.upsert).not.toHaveBeenCalled();
    expect(client.identityProvider.update).toHaveBeenLastCalledWith({
      where: { id: "provider-1" },
      data: {
        lastSyncStatus: "dry_run_succeeded",
        lastSyncError: null
      }
    });
  });

  it("rejects real LDAPS sync for draft providers while allowing dry-run to own the preview path", async () => {
    const ldapClient = {
      bind: vi.fn(),
      search: vi.fn(),
      searchPaginated: vi.fn(),
      unbind: vi.fn()
    };
    const client = {
      identityProvider: {
        findFirst: vi.fn().mockResolvedValue({
          id: "provider-1",
          workspaceId: "workspace-1",
          type: "ACTIVE_DIRECTORY_LDAPS",
          status: "draft",
          ldapsUrl: "ldaps://dc01.example.com:636",
          ldapsBindDn: "CN=svc,DC=example,DC=com",
          ldapsBindSecretRef: "env:TEST_AD_BIND_PASSWORD",
          configJson: JSON.stringify({
            userSearchBase: "OU=Users,DC=example,DC=com",
            groupSearchBase: "OU=Groups,DC=example,DC=com"
          })
        }),
        update: vi.fn()
      },
      externalIdentity: {},
      identityGroup: {},
      userIdentityGroup: {},
      user: {},
      groupRoleMapping: {},
      authSession: {},
      auditLog: {}
    };
    const { syncDirectoryProvider } = await import("@/lib/auth/directory-sync");

    await expect(
      syncDirectoryProvider({
        workspaceId: "workspace-1",
        providerId: "provider-1",
        client: client as never,
        ldapClientFactory: vi.fn(() => ldapClient)
      })
    ).rejects.toThrow(/активного провайдера/);

    expect(ldapClient.bind).not.toHaveBeenCalled();
  });

  it("rejects unsafe LDAPS URLs at runtime before starting sync", async () => {
    const client = {
      identityProvider: {
        findFirst: vi.fn().mockResolvedValue({
          id: "provider-1",
          workspaceId: "workspace-1",
          type: "ACTIVE_DIRECTORY_LDAPS",
          status: "active",
          ldapsUrl: "ldaps://bind:password@dc01.example.com:636",
          ldapsBindDn: "CN=svc,DC=example,DC=com",
          ldapsBindSecretRef: "env:TEST_AD_BIND_PASSWORD",
          configJson: JSON.stringify({
            userSearchBase: "OU=Users,DC=example,DC=com",
            groupSearchBase: "OU=Groups,DC=example,DC=com"
          })
        }),
        update: vi.fn()
      },
      externalIdentity: {},
      identityGroup: {},
      userIdentityGroup: {},
      user: {},
      groupRoleMapping: {},
      authSession: {},
      auditLog: {}
    };
    const { syncDirectoryProvider } = await import("@/lib/auth/directory-sync");

    await expect(
      syncDirectoryProvider({
        workspaceId: "workspace-1",
        providerId: "provider-1",
        client: client as never,
        ldapClientFactory: vi.fn()
      })
    ).rejects.toThrow(/username\/password, query или fragment/);

    expect(client.identityProvider.update).not.toHaveBeenCalled();
  });

  it("reports LDAP referrals and skips non-nested memberOf groups missing from synced groups", async () => {
    process.env.TEST_AD_BIND_PASSWORD = "bind-secret";
    const searchPaginated = vi.fn(async function* (base: string) {
      if (base === "OU=Groups,DC=example,DC=com") {
        yield {
          searchEntries: [{ dn: "CN=Known QA,OU=Groups,DC=example,DC=com", cn: "Known QA" }],
          searchReferences: ["ldap://other.example.com/DC=other,DC=example"]
        };
        return;
      }

      yield {
        searchEntries: [
          {
            dn: "CN=QA User,OU=Users,DC=example,DC=com",
            objectGUID: Buffer.from("user-guid"),
            mail: "qa@example.com",
            displayName: "QA User",
            userAccountControl: "512",
            memberOf: ["CN=Known QA,OU=Groups,DC=example,DC=com", "CN=Missing QA,OU=Groups,DC=example,DC=com"]
          }
        ],
        searchReferences: ["ldap://referral.example.com/DC=ref,DC=example"]
      };
    });
    const ldapClient = {
      bind: vi.fn().mockResolvedValue(undefined),
      search: vi.fn(),
      searchPaginated,
      unbind: vi.fn().mockResolvedValue(undefined)
    };
    const client = {
      identityProvider: {
        findFirst: vi.fn().mockResolvedValue({
          id: "provider-1",
          workspaceId: "workspace-1",
          type: "ACTIVE_DIRECTORY_LDAPS",
          status: "draft",
          ldapsUrl: "ldaps://dc01.example.com:636",
          ldapsBindDn: "CN=svc,DC=example,DC=com",
          ldapsBindSecretRef: "env:TEST_AD_BIND_PASSWORD",
          configJson: JSON.stringify({
            userSearchBase: "OU=Users,DC=example,DC=com",
            groupSearchBase: "OU=Groups,DC=example,DC=com"
          })
        }),
        update: vi.fn().mockResolvedValue({})
      },
      externalIdentity: {},
      identityGroup: {},
      userIdentityGroup: {},
      user: {},
      groupRoleMapping: {},
      authSession: {},
      auditLog: {}
    };
    const { syncDirectoryProvider } = await import("@/lib/auth/directory-sync");

    await expect(
      syncDirectoryProvider({
        workspaceId: "workspace-1",
        providerId: "provider-1",
        dryRun: true,
        client: client as never,
        ldapClientFactory: vi.fn(() => ldapClient)
      })
    ).resolves.toMatchObject({
      diagnostics: {
        searchReferencesSkipped: 2,
        skippedUnknownGroupMemberships: 1
      },
      preview: {
        users: [
          expect.objectContaining({
            groups: ["CN=Known QA,OU=Groups,DC=example,DC=com"]
          })
        ]
      }
    });
  });

  it("persists dry-run failure ledger when LDAPS bind env ref is missing before client setup", async () => {
    delete process.env.MISSING_AD_BIND_PASSWORD;
    const ldapClientFactory = vi.fn();
    const client = {
      identityProvider: {
        findFirst: vi.fn().mockResolvedValue({
          id: "provider-1",
          workspaceId: "workspace-1",
          type: "ACTIVE_DIRECTORY_LDAPS",
          status: "draft",
          ldapsUrl: "ldaps://dc01.example.com:636",
          ldapsBindDn: "CN=svc,DC=example,DC=com",
          ldapsBindSecretRef: "env:MISSING_AD_BIND_PASSWORD",
          configJson: JSON.stringify({
            userSearchBase: "OU=Users,DC=example,DC=com",
            groupSearchBase: "OU=Groups,DC=example,DC=com"
          })
        }),
        update: vi.fn().mockResolvedValue({})
      },
      externalIdentity: {},
      identityGroup: {},
      userIdentityGroup: {},
      user: {},
      groupRoleMapping: {},
      authSession: {},
      auditLog: {}
    };
    const { syncDirectoryProvider } = await import("@/lib/auth/directory-sync");

    await expect(
      syncDirectoryProvider({
        workspaceId: "workspace-1",
        providerId: "provider-1",
        dryRun: true,
        client: client as never,
        ldapClientFactory
      })
    ).rejects.toThrow(/пустую переменную окружения/);

    expect(ldapClientFactory).not.toHaveBeenCalled();
    expect(client.identityProvider.update).toHaveBeenNthCalledWith(1, {
      where: { id: "provider-1" },
      data: {
        lastSyncStartedAt: expect.any(Date),
        lastSyncStatus: "ldaps_dry_run_started",
        lastSyncError: null
      }
    });
    expect(client.identityProvider.update).toHaveBeenLastCalledWith({
      where: { id: "provider-1" },
      data: {
        lastSyncStatus: "ldaps_dry_run_failed",
        lastSyncError: expect.stringContaining("пустую переменную окружения")
      }
    });
  });

  it("persists sync failure ledger when LDAPS CA env ref cannot be resolved before bind", async () => {
    process.env.TEST_AD_BIND_PASSWORD = "bind-secret";
    delete process.env.MISSING_AD_CA_PEM;
    const ldapClientFactory = vi.fn();
    const client = {
      identityProvider: {
        findFirst: vi.fn().mockResolvedValue({
          id: "provider-1",
          workspaceId: "workspace-1",
          type: "ACTIVE_DIRECTORY_LDAPS",
          status: "active",
          ldapsUrl: "ldaps://dc01.example.com:636",
          ldapsBindDn: "CN=svc,DC=example,DC=com",
          ldapsBindSecretRef: "env:TEST_AD_BIND_PASSWORD",
          configJson: JSON.stringify({
            userSearchBase: "OU=Users,DC=example,DC=com",
            groupSearchBase: "OU=Groups,DC=example,DC=com",
            caCertRefs: ["env:MISSING_AD_CA_PEM"]
          })
        }),
        update: vi.fn().mockResolvedValue({})
      },
      externalIdentity: {},
      identityGroup: {},
      userIdentityGroup: {},
      user: {},
      groupRoleMapping: {},
      authSession: {},
      auditLog: {}
    };
    const { syncDirectoryProvider } = await import("@/lib/auth/directory-sync");

    await expect(
      syncDirectoryProvider({
        workspaceId: "workspace-1",
        providerId: "provider-1",
        client: client as never,
        ldapClientFactory
      })
    ).rejects.toThrow(/LDAPS CA ref/);

    expect(ldapClientFactory).not.toHaveBeenCalled();
    expect(client.identityProvider.update).toHaveBeenNthCalledWith(1, {
      where: { id: "provider-1" },
      data: {
        lastSyncStartedAt: expect.any(Date),
        lastSyncStatus: "ldaps_sync_started",
        lastSyncError: null
      }
    });
    expect(client.identityProvider.update).toHaveBeenLastCalledWith({
      where: { id: "provider-1" },
      data: {
        lastSyncStatus: "ldaps_sync_failed",
        lastSyncError: expect.stringContaining("LDAPS CA ref")
      }
    });
  });

  it("redacts resolved LDAPS secrets, PEM material, and URL credentials from failure ledger", async () => {
    process.env.TEST_AD_BIND_PASSWORD = "bind-secret";
    process.env.TEST_AD_CA_PEM = "-----BEGIN CERTIFICATE-----\nraw-ca-material\n-----END CERTIFICATE-----";
    const ldapClient = {
      bind: vi.fn().mockRejectedValue(new Error("bind failed bind-secret -----BEGIN CERTIFICATE-----\nraw-ca-material\n-----END CERTIFICATE----- ldaps://user:pass@dc01.example.com:636")),
      search: vi.fn(),
      searchPaginated: vi.fn(),
      unbind: vi.fn().mockResolvedValue(undefined)
    };
    const client = {
      identityProvider: {
        findFirst: vi.fn().mockResolvedValue({
          id: "provider-1",
          workspaceId: "workspace-1",
          type: "ACTIVE_DIRECTORY_LDAPS",
          status: "active",
          ldapsUrl: "ldaps://dc01.example.com:636",
          ldapsBindDn: "CN=svc,DC=example,DC=com",
          ldapsBindSecretRef: "env:TEST_AD_BIND_PASSWORD",
          configJson: JSON.stringify({
            userSearchBase: "OU=Users,DC=example,DC=com",
            groupSearchBase: "OU=Groups,DC=example,DC=com",
            caCertRefs: ["env:TEST_AD_CA_PEM"]
          })
        }),
        update: vi.fn().mockResolvedValue({})
      },
      externalIdentity: {},
      identityGroup: {},
      userIdentityGroup: {},
      user: {},
      groupRoleMapping: {},
      authSession: {},
      auditLog: {}
    };
    const { syncDirectoryProvider } = await import("@/lib/auth/directory-sync");

    await expect(
      syncDirectoryProvider({
        workspaceId: "workspace-1",
        providerId: "provider-1",
        client: client as never,
        ldapClientFactory: vi.fn(() => ldapClient)
      })
    ).rejects.toThrow(/redacted/);

    const failure = client.identityProvider.update.mock.calls.at(-1)?.[0].data.lastSyncError;
    expect(failure).toContain("[redacted]");
    expect(failure).not.toContain("bind-secret");
    expect(failure).not.toContain("raw-ca-material");
    expect(failure).not.toContain("user:pass");
  });

  it("persists LDAPS users, groups, memberships, and suspends disabled AD accounts through lifecycle helpers", async () => {
    process.env.TEST_AD_BIND_PASSWORD = "bind-secret";
    const ldapClient = {
      bind: vi.fn().mockResolvedValue(undefined),
      searchPaginated: vi.fn(async function* (base: string) {
        if (base === "OU=Groups,DC=example,DC=com") {
          yield {
            searchEntries: [{ dn: "CN=QA,OU=Groups,DC=example,DC=com", cn: "QA" }],
            searchReferences: []
          };
          return;
        }

        yield {
          searchEntries: [
            {
              dn: "CN=Disabled User,OU=Users,DC=example,DC=com",
              objectGUID: Buffer.from("disabled-guid"),
              mail: "disabled@example.com",
              displayName: "Disabled User",
              userAccountControl: "514",
              memberOf: ["CN=QA,OU=Groups,DC=example,DC=com"]
            }
          ],
          searchReferences: []
        };
      }),
      search: vi.fn(),
      unbind: vi.fn().mockResolvedValue(undefined)
    };
    const client = {
      identityProvider: {
        findFirst: vi.fn().mockResolvedValue({
          id: "provider-1",
          workspaceId: "workspace-1",
          type: "ACTIVE_DIRECTORY_LDAPS",
          status: "active",
          ldapsUrl: "ldaps://dc01.example.com:636",
          ldapsBindDn: "CN=svc,DC=example,DC=com",
          ldapsBindSecretRef: "env:TEST_AD_BIND_PASSWORD",
          configJson: JSON.stringify({
            userSearchBase: "OU=Users,DC=example,DC=com",
            groupSearchBase: "OU=Groups,DC=example,DC=com",
            missingUserAction: "suspend"
          })
        }),
        update: vi.fn().mockResolvedValue({})
      },
      externalIdentity: {
        findFirst: vi.fn().mockResolvedValue({
          id: "identity-1",
          userId: "user-1",
          providerSubject: "disabled-guid",
          user: {
            id: "user-1",
            workspaceId: "workspace-1",
            email: "disabled@example.com",
            name: "Disabled User",
            role: "SUPPORT_AGENT",
            supportLine: null,
            teamName: null,
            lifecycleStatus: "ACTIVE",
            sourceOfTruthProviderId: "provider-1"
          }
        }),
        findMany: vi.fn().mockResolvedValue([
          {
            id: "identity-1",
            userId: "user-1",
            providerSubject: Buffer.from("disabled-guid").toString("base64"),
            user: { id: "user-1" }
          },
          {
            id: "identity-missing",
            userId: "user-missing",
            providerSubject: "missing-user",
            user: { id: "user-missing" }
          }
        ]),
        create: vi.fn(),
        update: vi.fn().mockResolvedValue({})
      },
      identityGroup: {
        upsert: vi.fn().mockResolvedValue({})
      },
      userIdentityGroup: {
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        upsert: vi.fn().mockResolvedValue({}),
        findMany: vi.fn().mockResolvedValue([])
      },
      user: {
        findFirst: vi.fn().mockResolvedValue({ id: "user-1" }),
        create: vi.fn(),
        update: vi.fn().mockResolvedValue({
          id: "user-1",
          workspaceId: "workspace-1",
          lifecycleStatus: "SUSPENDED",
          sourceOfTruthProviderId: "provider-1"
        })
      },
      groupRoleMapping: {
        findMany: vi.fn().mockResolvedValue([])
      },
      authSession: {
        updateMany: vi.fn().mockResolvedValue({ count: 2 })
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({})
      }
    };
    const { syncDirectoryProvider } = await import("@/lib/auth/directory-sync");

    await expect(
      syncDirectoryProvider({
        workspaceId: "workspace-1",
        providerId: "provider-1",
        client: client as never,
        ldapClientFactory: vi.fn(() => ldapClient)
      })
    ).resolves.toMatchObject({
      disabledUsers: 1,
      updatedUsers: 1,
      suspendedUsers: 2,
      missingUsers: 1,
      groupsUpserted: 1,
      membershipsUpserted: 1,
      membershipsRemoved: 1
    });

    expect(client.identityGroup.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        externalGroupId: "CN=QA,OU=Groups,DC=example,DC=com",
        externalGroupName: "QA"
      })
    }));
    expect(client.externalIdentity.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "identity-1" },
      data: expect.objectContaining({
        disabledAt: expect.any(Date),
        rawClaimsJson: expect.stringContaining("disabled")
      })
    }));
    expect(client.authSession.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        userId: "user-1",
        status: "ACTIVE"
      })
    }));
  });

  it("persists real LDAPS sync writes and success ledger inside one transaction", async () => {
    process.env.TEST_AD_BIND_PASSWORD = "bind-secret";
    const ldapClient = {
      bind: vi.fn().mockResolvedValue(undefined),
      searchPaginated: vi.fn(async function* (base: string) {
        if (base === "OU=Groups,DC=example,DC=com") {
          yield {
            searchEntries: [{ dn: "CN=QA,OU=Groups,DC=example,DC=com", cn: "QA" }],
            searchReferences: []
          };
          return;
        }

        yield {
          searchEntries: [
            {
              dn: "CN=QA User,OU=Users,DC=example,DC=com",
              objectGUID: Buffer.from("user-guid"),
              mail: "qa@example.com",
              displayName: "QA User",
              userAccountControl: "512",
              memberOf: ["CN=QA,OU=Groups,DC=example,DC=com"]
            }
          ],
          searchReferences: []
        };
      }),
      search: vi.fn(),
      unbind: vi.fn().mockResolvedValue(undefined)
    };
    const tx = {
      identityProvider: {
        update: vi.fn().mockResolvedValue({})
      },
      externalIdentity: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({})
      },
      identityGroup: {
        upsert: vi.fn().mockResolvedValue({})
      },
      userIdentityGroup: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        upsert: vi.fn().mockResolvedValue({}),
        findMany: vi.fn().mockResolvedValue([])
      },
      user: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockRejectedValue(new Error("db write failed")),
        update: vi.fn()
      },
      groupRoleMapping: {
        findMany: vi.fn().mockResolvedValue([])
      },
      authSession: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 })
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({})
      }
    };
    const client = {
      $transaction: vi.fn(async (callback) => callback(tx)),
      identityProvider: {
        findFirst: vi.fn().mockResolvedValue({
          id: "provider-1",
          workspaceId: "workspace-1",
          type: "ACTIVE_DIRECTORY_LDAPS",
          status: "active",
          ldapsUrl: "ldaps://dc01.example.com:636",
          ldapsBindDn: "CN=svc,DC=example,DC=com",
          ldapsBindSecretRef: "env:TEST_AD_BIND_PASSWORD",
          configJson: JSON.stringify({
            userSearchBase: "OU=Users,DC=example,DC=com",
            groupSearchBase: "OU=Groups,DC=example,DC=com"
          })
        }),
        update: vi.fn().mockResolvedValue({})
      },
      externalIdentity: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn()
      },
      identityGroup: {
        upsert: vi.fn()
      },
      userIdentityGroup: {
        deleteMany: vi.fn(),
        upsert: vi.fn(),
        findMany: vi.fn()
      },
      user: {
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn()
      },
      groupRoleMapping: {
        findMany: vi.fn()
      },
      authSession: {
        updateMany: vi.fn()
      },
      auditLog: {
        create: vi.fn()
      }
    };
    const { syncDirectoryProvider } = await import("@/lib/auth/directory-sync");

    await expect(
      syncDirectoryProvider({
        workspaceId: "workspace-1",
        providerId: "provider-1",
        client: client as never,
        ldapClientFactory: vi.fn(() => ldapClient)
      })
    ).rejects.toThrow("db write failed");

    expect(client.$transaction).toHaveBeenCalledOnce();
    expect(tx.identityGroup.upsert).toHaveBeenCalled();
    expect(tx.user.create).toHaveBeenCalled();
    expect(tx.identityProvider.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lastSyncStatus: "succeeded" })
      })
    );
    expect(client.identityGroup.upsert).not.toHaveBeenCalled();
    expect(client.user.create).not.toHaveBeenCalled();
    expect(client.identityProvider.update).toHaveBeenLastCalledWith({
      where: { id: "provider-1" },
      data: {
        lastSyncStatus: "ldaps_sync_failed",
        lastSyncError: "db write failed"
      }
    });
  });
});
