"use client";

import { useEffect, useState } from "react";
import { deleteUser, getCurrentUser, listUsers, setUserBlocked, setUserRole } from "../../../client/api";
import type { UserAccount, UserRole } from "@hermione/core/server/models";
import { PageShell } from "../../../components/PageHeader";
import { Breadcrumbs } from "../../../components/Breadcrumbs";

const ROLES: UserRole[] = ["viewer", "editor", "admin"];

/** Admin-only page to manage every person who has ever signed in: change their role
 * (viewer/editor/admin), block/unblock sign-in, or delete their account outright. Gated by
 * isAdmin (see server/auth.ts's AUTH_ADMIN_EMAILS). A user can't change their own role/blocked
 * status or delete themselves, to avoid locking every admin out at once. */
export default function AdminUsersPage() {
  const [me, setMe] = useState<UserAccount | null>(null);
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getCurrentUser()
      .then(setMe)
      .catch(() => setMe(null));
    refresh();
  }, []);

  function refresh(): void {
    listUsers()
      .then((r) => setUsers(r.users))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }

  async function changeRole(userId: string, role: UserRole): Promise<void> {
    try {
      const updated = await setUserRole(userId, role);
      setUsers((prev) => prev.map((u) => (u.id === userId ? updated : u)));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function toggleBlocked(user: UserAccount): Promise<void> {
    try {
      const updated = await setUserBlocked(user.id, !user.blocked);
      setUsers((prev) => prev.map((u) => (u.id === user.id ? updated : u)));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function remove(user: UserAccount): Promise<void> {
    if (!confirm(`Delete the user ${user.email}? This cannot be undone.`)) return;
    try {
      await deleteUser(user.id);
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  if (me && !me.isAdmin) {
    return (
      <PageShell>
        <Breadcrumbs items={[{ label: "Users" }]} />
        <p>You don't have access to this page.</p>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <Breadcrumbs items={[{ label: "Users" }]} />

      <div className="modal-box" style={{ width: "100%", maxWidth: 900 }}>
        <h2 className="modal-title">Users</h2>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "6px 8px" }}>Email</th>
              <th style={{ textAlign: "left", padding: "6px 8px" }}>Name</th>
              <th style={{ textAlign: "left", padding: "6px 8px" }}>Role</th>
              <th style={{ textAlign: "left", padding: "6px 8px" }}>Status</th>
              <th style={{ textAlign: "left", padding: "6px 8px" }}>Last login</th>
              <th style={{ textAlign: "left", padding: "6px 8px" }}></th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const isSelf = user.id === me?.id;
              return (
                <tr key={user.id}>
                  <td style={{ padding: "6px 8px" }}>{user.email}</td>
                  <td style={{ padding: "6px 8px" }}>{user.name ?? "—"}</td>
                  <td style={{ padding: "6px 8px" }}>
                    <select value={user.role} disabled={isSelf} onChange={(e) => changeRole(user.id, e.target.value as UserRole)}>
                      {ROLES.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td style={{ padding: "6px 8px" }}>{user.blocked ? "Blocked" : "Active"}</td>
                  <td style={{ padding: "6px 8px" }}>{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : "—"}</td>
                  <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>
                    <button type="button" className="btn btn-gray btn-sm" disabled={isSelf} onClick={() => toggleBlocked(user)} style={{ marginRight: 6 }}>
                      {user.blocked ? "Unblock" : "Block"}
                    </button>
                    <button type="button" className="btn btn-outline btn-sm" disabled={isSelf} onClick={() => remove(user)}>
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
            {users.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: "6px 8px" }}>
                  No users yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {error && <p className="auth-page-error">{error}</p>}
    </PageShell>
  );
}
