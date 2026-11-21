// Real monday.com GraphQL client.
import { AppError } from "../errors";
import type { MondayApi, MondayBoard } from "./types";

const URL = "https://api.monday.com/v2";

async function gql<T>(token: string, query: string, variables: Record<string, unknown> = {}): Promise<T> {
  if (!token) throw new AppError("monday_no_token");
  let res: Response;
  try {
    res = await fetch(URL, {
      method: "POST",
      headers: { Authorization: token, "Content-Type": "application/json", "API-Version": "2025-04" },
      body: JSON.stringify({ query, variables }),
      cache: "no-store",
    });
  } catch (e) {
    throw new AppError("monday_network", (e as Error).message);
  }
  const text = await res.text();
  if (res.status === 401) throw new AppError("monday_auth", text.slice(0, 300));
  let j: { data?: T; errors?: { message: string }[]; error_message?: string; errors_message?: string };
  try {
    j = JSON.parse(text);
  } catch {
    throw new AppError("monday_api", `${res.status} ${text.slice(0, 300)}`);
  }
  const msg = j.errors?.map((e) => e.message).join("; ") || j.error_message;
  if (msg || !res.ok) {
    if (/not authenticated|unauthorized|invalid token/i.test(msg || "")) throw new AppError("monday_auth", msg);
    throw new AppError("monday_api", msg || `${res.status}`);
  }
  return j.data as T;
}

export const realMonday: MondayApi = {
  async me(token) {
    const d = await gql<{ me: { name: string; account: { slug: string } } }>(token, `query { me { name account { slug } } }`);
    return { name: d.me.name, accountSlug: d.me.account.slug };
  },
  async board(token, boardId) {
    const d = await gql<{ boards: { id: string; name: string; groups: { id: string; title: string }[]; columns: { id: string; title: string; type: string }[] }[] }>(
      token,
      `query ($ids: [ID!]) { boards(ids: $ids) { id name groups { id title } columns { id title type } } }`,
      { ids: [boardId] },
    );
    const b = d.boards?.[0];
    if (!b) throw new AppError("monday_board_not_found", boardId);
    return b as MondayBoard;
  },
  async createItem(token, boardId, groupId, name, values) {
    const d = await gql<{ create_item: { id: string } }>(
      token,
      `mutation ($b: ID!, $g: String, $n: String!, $v: JSON) { create_item(board_id: $b, group_id: $g, item_name: $n, column_values: $v, create_labels_if_missing: true) { id } }`,
      { b: boardId, g: groupId || null, n: name, v: JSON.stringify(values) },
    );
    return { id: d.create_item.id };
  },
  async updateItem(token, boardId, itemId, values) {
    if (!Object.keys(values).length) return;
    await gql(
      token,
      `mutation ($b: ID!, $i: ID!, $v: JSON!) { change_multiple_column_values(board_id: $b, item_id: $i, column_values: $v, create_labels_if_missing: true) { id } }`,
      { b: boardId, i: itemId, v: JSON.stringify(values) },
    );
  },
  async deleteItem(token, itemId) {
    await gql(token, `mutation ($i: ID!) { delete_item(item_id: $i) { id } }`, { i: itemId });
  },
  async createColumn(token, boardId, title, type) {
    const d = await gql<{ create_column: { id: string } }>(
      token,
      `mutation ($b: ID!, $t: String!, $c: ColumnType!) { create_column(board_id: $b, title: $t, column_type: $c) { id } }`,
      { b: boardId, t: title, c: type },
    );
    return { id: d.create_column.id };
  },
};
